import { createHash } from 'node:crypto';
import { MAX_PRINT_FILE_BYTES, type FileHost, type FileToShare, type SharedFile } from '@pod/core';
import { sendWithRetries, sleep } from '@pod/adapter-http';
import { AwsClient } from 'aws4fetch';
import { FileHostNotConnectedError, FileHostRequestError, waitOf } from './errors.js';
import type { FileHostDeps } from './file-host-deps.js';
import { readForUpload } from './file-size.js';
import { objectKey } from './object-key.js';
import { releaseOnce } from './release-once.js';
import { defaultSignal, type SignalFor } from './timeouts.js';

/** Long enough for a print provider to fetch the file, short enough to keep it private. */
export const PRESIGNED_URL_SECONDS = 900;

/** No print file the app makes is larger; S3 itself takes up to 5 GB in one upload. */
const UPLOAD_LIMIT = {
  host: 's3',
  maxBytes: MAX_PRINT_FILE_BYTES,
} as const;

export interface S3Credentials {
  /** Service address without the bucket, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  readonly endpoint: string;
  /**
   * `auto` when left out, which only Cloudflare R2 accepts; AWS S3 and other
   * stores sign with their own region, e.g. `eu-central-1`.
   */
  readonly region?: string | undefined;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type S3FileHostDeps = FileHostDeps<S3Credentials>;

/** Answers S3-compatible stores give for a moment of overload, worth one or two more tries. */
const BUSY_STATUSES: readonly number[] = [500, 503];
const MAX_RETRIES = 2;

/** Shares files from S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2) through presigned links. */
export class S3FileHost implements FileHost {
  private readonly signal: SignalFor;

  constructor(private readonly deps: S3FileHostDeps) {
    this.signal = deps.signal ?? defaultSignal;
  }

  async share(file: FileToShare): Promise<SharedFile> {
    const credentials = await this.deps.credentials();
    if (!credentials) throw new FileHostNotConnectedError('s3');
    const client = new AwsClient({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      service: 's3',
      region: credentials.region ?? 'auto',
    });
    const url = objectUrl(credentials, objectKey(file.name, this.deps.ids));
    const { readFile, fileSize } = this.deps;
    const body = await readForUpload(file.absolutePath, UPLOAD_LIMIT, readFile, fileSize);

    const upload = await client.sign(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.mimeType,
        'X-Amz-Content-Sha256': createHash('sha256').update(body).digest('hex'),
      },
      body,
      aws: { datetime: this.datetime() },
    });
    try {
      await this.send(upload, this.signal('upload', body.byteLength));
    } catch (error) {
      // A failed upload may still have been stored, e.g. one whose answer was lost; nothing else would remove it.
      await this.remove(client, url).catch(() => undefined);
      throw error;
    }

    return {
      url: await this.presign(client, url),
      release: releaseOnce(() => this.remove(client, url)),
    };
  }

  private async presign(client: AwsClient, url: string): Promise<string> {
    const presigned = new URL(url);
    presigned.searchParams.set('X-Amz-Expires', String(PRESIGNED_URL_SECONDS));
    const request = await client.sign(presigned.toString(), {
      method: 'GET',
      aws: { signQuery: true, datetime: this.datetime() },
    });
    return request.url;
  }

  private async remove(client: AwsClient, url: string): Promise<void> {
    const request = await client.sign(url, {
      method: 'DELETE',
      aws: { datetime: this.datetime() },
    });
    await this.send(request, this.signal('request'), [404]);
  }

  private async send(
    request: Request,
    signal: AbortSignal,
    alsoFine: readonly number[] = [],
  ): Promise<void> {
    const response = await sendWithRetries(() => this.deps.fetch(request.clone(), { signal }), {
      maxRetries: MAX_RETRIES,
      alsoRetry: BUSY_STATUSES,
      sleep: this.deps.sleep ?? sleep,
    });
    if (response.ok || alsoFine.includes(response.status)) return;
    const text = await response.text();
    const reason = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    throw new FileHostRequestError('s3', response.status, reason, waitOf(response));
  }

  /** Signing time in the compact ISO form AWS uses, e.g. `20261024T101500Z`. */
  private datetime(): string {
    return this.deps.clock
      .now()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '');
  }
}

/** Path-style address, which every S3-compatible service accepts. */
export function objectUrl(credentials: S3Credentials, key: string): string {
  const endpoint = credentials.endpoint.replace(/\/+$/, '');
  const path = [credentials.bucket, ...key.split('/')].map(encodeURIComponent).join('/');
  return `${endpoint}/${path}`;
}
