import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedClock, SequentialIds } from '@pod/core/testing';
import {
  FileHostNotConnectedError,
  FileHostRequestError,
  FileTooLargeToShareError,
} from './errors.js';
import {
  objectUrl,
  PRESIGNED_URL_SECONDS,
  S3FileHost,
  type S3Credentials,
} from './s3-file-host.js';
import { empty, ResponderFetch, text } from './testing/responder-fetch.js';

const FILE = {
  absolutePath: '/data/assets/ab/cd.png',
  mimeType: 'image/png',
  name: '01-mug-r2.png',
} as const;
const BYTES = new Uint8Array([1, 2, 3]);
const R2: S3Credentials = {
  endpoint: 'https://account.r2.cloudflarestorage.com/',
  bucket: 'pod-files',
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
};
const OBJECT_URL =
  'https://account.r2.cloudflarestorage.com/pod-files/pod-pipeline/id-0001/01-mug-r2.png';

describe('S3FileHost', () => {
  let fake: ResponderFetch;
  let credentials: S3Credentials | undefined;
  let host: S3FileHost;

  beforeEach(() => {
    fake = new ResponderFetch();
    credentials = R2;
    host = new S3FileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile: vi.fn(() => Promise.resolve(BYTES)),
      ids: new SequentialIds(),
      clock: new FixedClock(new Date('2026-10-24T10:15:00.000Z')),
      sleep: () => Promise.resolve(),
    });
  });

  it('uploads with a signed request and shares a presigned link', async () => {
    fake.reply(empty());

    const shared = await host.share(FILE);

    const [upload] = fake.requests;
    expect(upload?.method).toBe('PUT');
    expect(upload?.url).toBe(OBJECT_URL);
    expect(upload?.headers.get('content-type')).toBe('image/png');
    expect(upload?.headers.get('x-amz-content-sha256')).toBe(
      createHash('sha256').update(BYTES).digest('hex'),
    );
    expect(upload?.headers.get('x-amz-date')).toBe('20261024T101500Z');
    expect(upload?.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20261024\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(new Uint8Array((await upload?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(BYTES);

    const link = new URL(shared.url);
    expect(`${link.origin}${link.pathname}`).toBe(OBJECT_URL);
    expect(link.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(link.searchParams.get('X-Amz-Expires')).toBe(String(PRESIGNED_URL_SECONDS));
    expect(link.searchParams.get('X-Amz-Date')).toBe('20261024T101500Z');
    expect(link.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(fake.requests).toHaveLength(1);
  });

  it('uses the configured region in the signature', async () => {
    credentials = {
      ...R2,
      endpoint: 'https://s3.eu-central-1.amazonaws.com',
      region: 'eu-central-1',
    };
    fake.reply(empty());

    const shared = await host.share(FILE);

    expect(new URL(shared.url).searchParams.get('X-Amz-Credential')).toBe(
      'AKID/20261024/eu-central-1/s3/aws4_request',
    );
  });

  it('deletes the object once, however often it is released', async () => {
    fake.reply(empty(), empty(204));
    const shared = await host.share(FILE);

    await Promise.all([shared.release(), shared.release()]);
    await shared.release();

    const deletes = fake.requests.filter((request) => request.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.url).toBe(OBJECT_URL);
    expect(deletes[0]?.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it('treats an object that is already gone as released, and lets failures be retried', async () => {
    const internal = text('<Error><Code>InternalError</Code></Error>', 500);
    fake.reply(empty(), internal, internal, internal, empty(404));
    const shared = await host.share(FILE);

    await expect(shared.release()).rejects.toMatchObject({ status: 500, reason: 'InternalError' });
    await expect(shared.release()).resolves.toBeUndefined();
  });

  it('sends an upload again while the store is busy for a moment', async () => {
    fake.reply(text('<Error><Code>SlowDown</Code></Error>', 503), empty());

    await host.share(FILE);

    expect(fake.requests.map(({ method }) => method)).toEqual(['PUT', 'PUT']);
    expect(new Uint8Array(await (fake.requests[1]?.arrayBuffer() ?? new ArrayBuffer(0)))).toEqual(
      BYTES,
    );
  });

  it('removes what an upload cut off midway may have stored', async () => {
    const reset = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    fake.reply(() => Promise.reject(reset), empty(204));

    await expect(host.share(FILE)).rejects.toBe(reset);
    expect(fake.requests.map(({ method, url }) => [method, url])).toEqual([
      ['PUT', OBJECT_URL],
      ['DELETE', OBJECT_URL],
    ]);
  });

  it('removes what a failed upload may have stored, keeping the upload error', async () => {
    fake.reply(text('<Error><Code>EntityTooLarge</Code></Error>', 400), empty(204));

    await expect(host.share(FILE)).rejects.toMatchObject({ status: 400, reason: 'EntityTooLarge' });
    expect(fake.requests.map(({ method }) => method)).toEqual(['PUT', 'DELETE']);
  });

  it('reports upload errors with the S3 error code', async () => {
    fake.reply(text('<?xml version="1.0"?><Error><Code>NoSuchBucket</Code></Error>', 404));

    const error = await host.share(FILE).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileHostRequestError);
    expect(error).toMatchObject({ host: 's3', status: 404, reason: 'NoSuchBucket' });
  });

  it('reports errors without an XML body', async () => {
    fake.reply(text('', 403));

    await expect(host.share(FILE)).rejects.toMatchObject({ status: 403, reason: undefined });
  });

  it('fails without credentials before touching the network', async () => {
    credentials = undefined;

    await expect(host.share(FILE)).rejects.toBeInstanceOf(FileHostNotConnectedError);
    expect(fake.requests).toHaveLength(0);
  });

  it('gives the upload and the removal their own time limits', async () => {
    const signal = vi.fn(() => AbortSignal.abort());
    const timed = new S3FileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile: vi.fn(() => Promise.resolve(BYTES)),
      ids: new SequentialIds(),
      clock: new FixedClock(new Date('2026-10-24T10:15:00.000Z')),
      signal,
    });
    fake.reply(empty(), empty(204));

    await (await timed.share(FILE)).release();

    expect(signal.mock.calls).toEqual([['upload', 3], ['request']]);
    expect(fake.requests.every((request) => request.signal.aborted)).toBe(true);
  });
});

describe('S3FileHost limits', () => {
  it('refuses a file larger than any print file before reading it', async () => {
    const fake = new ResponderFetch();
    const readFile = vi.fn(() => Promise.resolve(BYTES));
    const host = new S3FileHost({
      credentials: () => Promise.resolve(R2),
      fetch: fake.fetch,
      readFile,
      fileSize: () => Promise.resolve(100_000_001),
      ids: new SequentialIds(),
      clock: new FixedClock(new Date('2026-10-24T10:15:00.000Z')),
    });

    await expect(host.share(FILE)).rejects.toThrow(
      new FileTooLargeToShareError('s3', 100_000_001, 100_000_000),
    );
    expect(readFile).not.toHaveBeenCalled();
    expect(fake.requests).toEqual([]);
  });
});

describe('objectUrl', () => {
  it('builds a path-style address with encoded segments', () => {
    expect(objectUrl(R2, 'pod-pipeline/id-0001/Kırağı bahçesi #1.png')).toBe(
      'https://account.r2.cloudflarestorage.com/pod-files/pod-pipeline/id-0001/K%C4%B1ra%C4%9F%C4%B1%20bah%C3%A7esi%20%231.png',
    );
  });
});
