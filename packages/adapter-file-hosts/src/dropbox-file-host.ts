import type { FileHost, FileToShare, SharedFile } from '@pod/core';
import { discard, sendWithRetries, sleep, type RotatingTokenSession } from '@pod/adapter-http';
import { dropboxApiArg, dropboxError, isNotFound } from './dropbox-api.js';
import { dropboxSession, type DropboxCredentials } from './dropbox-session.js';
import { FileHostRequestError, FileHostUnexpectedResponseError } from './errors.js';
import type { FileHostDeps } from './file-host-deps.js';
import { readForUpload } from './file-size.js';
import { objectKey } from './object-key.js';
import { releaseOnce } from './release-once.js';
import { defaultSignal, type SignalFor } from './timeouts.js';

const API = 'https://api.dropboxapi.com/2';
const CONTENT_API = 'https://content.dropboxapi.com/2';
/** Dropbox takes up to 150 MB in one upload. */
const UPLOAD_LIMIT = {
  host: 'dropbox',
  maxBytes: 150 * 1024 * 1024,
} as const;

/** Files larger than this go up in pieces of this size, so a slow line never holds one request open for minutes. */
const UPLOAD_CHUNK_BYTES = 1024 * 1024;
/** A piece whose connection drops is sent again, after a pause that grows, up to this many times. */
const CHUNK_ATTEMPTS = 8;
const RETRY_PAUSE_MS = 3_000;

export type DropboxFileHostDeps = FileHostDeps<DropboxCredentials> & {
  readonly uploadChunkBytes?: number | undefined;
};

type DropboxRequest = (token: string) => Promise<Response>;

/** Uploads into the app's own Dropbox folder and shares a link that expires after four hours. */
export class DropboxFileHost implements FileHost {
  private readonly session: RotatingTokenSession<DropboxCredentials>;
  private readonly signal: SignalFor;

  constructor(private readonly deps: DropboxFileHostDeps) {
    this.signal = deps.signal ?? defaultSignal;
    this.session = dropboxSession(deps.credentials, deps.fetch, deps.clock, this.signal);
  }

  async share(file: FileToShare): Promise<SharedFile> {
    const path = `/${objectKey(file.name, this.deps.ids)}`;
    const { readFile, fileSize } = this.deps;
    const body = await readForUpload(file.absolutePath, UPLOAD_LIMIT, readFile, fileSize);
    try {
      await this.upload(path, body);
    } catch (error) {
      // An upload whose answer was lost may be stored all the same.
      await this.remove(path).catch(() => undefined);
      throw error;
    }

    const release = releaseOnce(() => this.remove(path));
    try {
      const response = await this.call((token) =>
        this.post('files/get_temporary_link', token, { path }),
      );
      const { link } = (await response.json()) as { link?: unknown };
      if (typeof link !== 'string') {
        throw new FileHostUnexpectedResponseError('dropbox', 'temporary link without a link');
      }
      return { url: link, release };
    } catch (error) {
      await release().catch(() => undefined);
      throw error;
    }
  }

  /**
   * One request for a small file; an upload session in pieces for a large one.
   * The path is new and random, so overwriting lets a resent upload replace what a lost answer stored.
   */
  private async upload(path: string, body: Uint8Array<ArrayBuffer>): Promise<void> {
    const commit = { path, mode: 'overwrite', autorename: false, mute: true };
    const chunk = this.deps.uploadChunkBytes ?? UPLOAD_CHUNK_BYTES;
    if (body.byteLength <= chunk) {
      await discard(await this.send('files/upload', commit, body));
      return;
    }
    const started = await this.send(
      'files/upload_session/start',
      { close: false },
      body.subarray(0, chunk),
    );
    const { session_id: sessionId } = (await started.json()) as { session_id?: unknown };
    if (typeof sessionId !== 'string') {
      throw new FileHostUnexpectedResponseError('dropbox', 'upload session without an id');
    }
    for (let offset = chunk; offset < body.byteLength; offset += chunk) {
      const end = Math.min(offset + chunk, body.byteLength);
      const cursor = { session_id: sessionId, offset };
      const piece = body.subarray(offset, end);
      const response =
        end === body.byteLength
          ? await this.send('files/upload_session/finish', { cursor, commit }, piece)
          : await this.send('files/upload_session/append_v2', { cursor, close: false }, piece);
      await discard(response);
    }
  }

  /** Sends bytes to the content API, again after a dropped connection. */
  private async send(
    endpoint: string,
    arg: unknown,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call((token) =>
          this.deps.fetch(`${CONTENT_API}/${endpoint}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': dropboxApiArg(arg),
            },
            body: bytes,
            signal: this.signal('upload', bytes.byteLength),
          }),
        );
      } catch (error) {
        // A piece that arrived although its answer was lost: Dropbox already has it. Appending
        // reports `incorrect_offset`, finishing `lookup_failed/incorrect_offset`.
        if (
          attempt > 1 &&
          error instanceof FileHostRequestError &&
          /(^|\/)incorrect_offset/.test(error.reason ?? '')
        ) {
          return new Response('null', { status: 200 });
        }
        if (!dropped(error) || attempt >= CHUNK_ATTEMPTS) throw error;
        await (this.deps.sleep ?? sleep)(RETRY_PAUSE_MS * attempt);
      }
    }
  }

  private async remove(path: string): Promise<void> {
    try {
      await discard(await this.call((token) => this.post('files/delete_v2', token, { path })));
    } catch (error) {
      if (error instanceof FileHostRequestError && isNotFound(error)) return;
      throw error;
    }
  }

  private post(endpoint: string, token: string, body: unknown): Promise<Response> {
    return this.deps.fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.signal('request'),
    });
  }

  /** Retries once with a fresh token when Dropbox says the cached one expired, and after a short rate limit. */
  private async call(request: DropboxRequest): Promise<Response> {
    const response = await sendWithRetries(async () => request(await this.session.accessToken()), {
      maxRetries: 1,
      sleep: this.deps.sleep ?? sleep,
      maxWaitSeconds: 60,
      renew: () => {
        this.session.invalidate();
      },
    });
    if (!response.ok) throw await dropboxError(response);
    return response;
  }
}

/** A connection that dropped or stalled, as opposed to an answer from Dropbox or a missing connection. */
function dropped(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch failed: reset, DNS, socket closed
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
