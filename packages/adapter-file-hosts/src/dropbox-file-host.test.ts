import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedClock, SequentialIds } from '@pod/core/testing';
import { dropboxApiArg } from './dropbox-api.js';
import { DropboxFileHost } from './dropbox-file-host.js';
import type { DropboxCredentials } from './dropbox-session.js';
import {
  FileHostNotConnectedError,
  FileHostRequestError,
  FileHostUnexpectedResponseError,
  FileTooLargeToShareError,
} from './errors.js';
import { empty, ResponderFetch, json, text } from './testing/responder-fetch.js';

const FILE = {
  absolutePath: '/data/assets/ab/cd.png',
  mimeType: 'image/png',
  name: '01-mug-r2.png',
} as const;
const PATH = '/pod-pipeline/id-0001/01-mug-r2.png';
const BYTES = new Uint8Array([1, 2, 3]);
const LINK = 'https://dl.dropboxusercontent.com/apitl/1/abc';

const token = (accessToken = 'access-1', expiresIn = 14400) =>
  json({ access_token: accessToken, expires_in: expiresIn, token_type: 'bearer' });
const uploaded = json({ name: '01-mug-r2.png', path_display: PATH });
const linked = json({ link: LINK, metadata: {} });
const conflict = (summary: string) => json({ error_summary: summary, error: {} }, 409);

describe('DropboxFileHost', () => {
  let fake: ResponderFetch;
  let clock: FixedClock;
  let credentials: DropboxCredentials | undefined;
  let host: DropboxFileHost;
  const readFile = vi.fn(() => Promise.resolve(BYTES));

  beforeEach(() => {
    fake = new ResponderFetch();
    clock = new FixedClock(new Date('2026-10-24T10:15:00.000Z'));
    credentials = { appKey: 'app-key', refreshToken: 'refresh-1' };
    host = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      ids: new SequentialIds(),
      clock,
    });
  });

  it('uploads into the app folder and shares a temporary link', async () => {
    fake.reply(token(), uploaded, linked);

    const shared = await host.share(FILE);

    expect(shared.url).toBe(LINK);
    expect(readFile).toHaveBeenCalledWith(FILE.absolutePath);
    const [refresh, upload, link] = fake.requests;
    expect(Object.fromEntries(new URLSearchParams(await refresh?.text()))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
      client_id: 'app-key',
    });
    expect(upload?.url).toBe('https://content.dropboxapi.com/2/files/upload');
    expect(upload?.headers.get('authorization')).toBe('Bearer access-1');
    expect(upload?.headers.get('content-type')).toBe('application/octet-stream');
    expect(JSON.parse(upload?.headers.get('dropbox-api-arg') ?? '')).toEqual({
      path: PATH,
      mode: 'overwrite',
      autorename: false,
      mute: true,
    });
    expect(new Uint8Array((await upload?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(BYTES);
    expect(link?.url).toBe('https://api.dropboxapi.com/2/files/get_temporary_link');
    expect(await link?.json()).toEqual({ path: PATH });
  });

  it('uploads a large file in pieces through an upload session', async () => {
    const big = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const chunked = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile: () => Promise.resolve(big),
      ids: new SequentialIds(),
      clock,
      uploadChunkBytes: 3,
    });
    fake.reply(token(), json({ session_id: 's-1' }), json(null), uploaded, linked);

    const shared = await chunked.share(FILE);

    expect(shared.url).toBe(LINK);
    const [, start, append, finish] = fake.requests;
    expect(start?.url).toBe('https://content.dropboxapi.com/2/files/upload_session/start');
    expect(new Uint8Array((await start?.arrayBuffer()) ?? [])).toEqual(new Uint8Array([1, 2, 3]));
    expect(append?.url).toBe('https://content.dropboxapi.com/2/files/upload_session/append_v2');
    expect(JSON.parse(append?.headers.get('dropbox-api-arg') ?? '')).toEqual({
      cursor: { session_id: 's-1', offset: 3 },
      close: false,
    });
    expect(finish?.url).toBe('https://content.dropboxapi.com/2/files/upload_session/finish');
    expect(JSON.parse(finish?.headers.get('dropbox-api-arg') ?? '')).toEqual({
      cursor: { session_id: 's-1', offset: 6 },
      commit: { path: PATH, mode: 'overwrite', autorename: false, mute: true },
    });
    expect(new Uint8Array((await finish?.arrayBuffer()) ?? [])).toEqual(new Uint8Array([7]));
  });

  it('reuses the access token until shortly before it expires', async () => {
    fake.reply(token('access-1', 14400), uploaded, linked, uploaded, linked);
    await host.share(FILE);
    clock.advance((14400 - 61) * 1000);
    await host.share(FILE);
    clock.advance(2000);
    fake.reply(token('access-2'), uploaded, linked);
    await host.share(FILE);

    const authorizations = fake.requests.map((request) => request.headers.get('authorization'));
    expect(authorizations.filter((value) => value === null)).toHaveLength(2);
    expect(authorizations.at(-1)).toBe('Bearer access-2');
  });

  it('reuses a token that comes without a lifetime for the four hours Dropbox gives', async () => {
    fake.reply(json({ access_token: 'access-1' }), uploaded, linked);

    await host.share(FILE);

    expect(fake.requests[2]?.headers.get('authorization')).toBe('Bearer access-1');
  });

  it('refreshes again when the stored refresh token changes', async () => {
    fake.reply(token('access-1'), uploaded, linked);
    await host.share(FILE);
    credentials = { appKey: 'app-key', refreshToken: 'refresh-2' };
    fake.reply(token('access-2'), uploaded, linked);

    await host.share(FILE);

    expect(fake.requests[3]?.url).toBe('https://api.dropboxapi.com/oauth2/token');
    expect(fake.requests[4]?.headers.get('authorization')).toBe('Bearer access-2');
  });

  it('retries once with a new token when Dropbox rejects the cached one', async () => {
    fake.reply(token('access-1'), json({ error_summary: 'expired_access_token/' }, 401));
    fake.reply(token('access-2'), uploaded, linked);

    await expect(host.share(FILE)).resolves.toMatchObject({ url: LINK });
    expect(fake.requests[3]?.headers.get('authorization')).toBe('Bearer access-2');
  });

  it('escapes characters outside ASCII in the API argument header', async () => {
    fake.reply(token(), uploaded, linked);

    await host.share({ ...FILE, name: 'Kırağı bahçesi ☃.png' });

    const header = fake.requests[1]?.headers.get('dropbox-api-arg') ?? '';
    expect(header).toContain('K\\u0131ra\\u011f\\u0131 bah\\u00e7esi \\u2603.png');
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(JSON.parse(header)).toMatchObject({
      path: '/pod-pipeline/id-0001/Kırağı bahçesi ☃.png',
    });
    expect(dropboxApiArg({ a: '\u007f' })).toBe('{"a":"\\u007f"}');
  });

  it('removes the file once, however often it is released', async () => {
    fake.reply(token(), uploaded, linked, json({ metadata: {} }));
    const shared = await host.share(FILE);

    await Promise.all([shared.release(), shared.release()]);
    await shared.release();

    const deletes = fake.requests.filter((request) => request.url.endsWith('/files/delete_v2'));
    expect(deletes).toHaveLength(1);
    expect(await deletes[0]?.json()).toEqual({ path: PATH });
  });

  it('lets go of the upload and delete answers it does not read', async () => {
    const answers: Response[] = [];
    const kept = (body: unknown) => () => {
      const answer = Response.json(body);
      answers.push(answer);
      return answer;
    };
    fake.reply(token(), kept({ path_display: PATH }), linked, kept({ metadata: {} }));

    await (await host.share(FILE)).release();

    expect(answers.map((answer) => answer.bodyUsed)).toEqual([true, true]);
  });

  it('treats a file that is already gone as released', async () => {
    fake.reply(token(), uploaded, linked, conflict('path_lookup/not_found/..'));
    const shared = await host.share(FILE);

    await expect(shared.release()).resolves.toBeUndefined();
  });

  it('does not mistake other conflicts for a missing file', async () => {
    fake.reply(token(), uploaded, linked, text('locked', 409));
    const shared = await host.share(FILE);

    await expect(shared.release()).rejects.toMatchObject({ status: 409, reason: undefined });
  });

  it('lets a failed release be tried again', async () => {
    fake.reply(token(), uploaded, linked, text('busy', 503), json({ metadata: {} }));
    const shared = await host.share(FILE);

    await expect(shared.release()).rejects.toMatchObject({ status: 503, reason: undefined });
    await expect(shared.release()).resolves.toBeUndefined();
  });

  it('deletes the upload when the link cannot be created', async () => {
    fake.reply(token(), uploaded, conflict('path/not_found/'), empty());

    await expect(host.share(FILE)).rejects.toMatchObject({
      host: 'dropbox',
      status: 409,
      reason: 'path/not_found',
    });
    expect(fake.requests.at(-1)?.url).toBe('https://api.dropboxapi.com/2/files/delete_v2');
  });

  it('keeps the link error when the clean-up fails too', async () => {
    fake.reply(token(), uploaded, text('down', 500), text('still down', 503));

    await expect(host.share(FILE)).rejects.toMatchObject({ status: 500 });
  });

  it('reports upload errors with the Dropbox reason', async () => {
    fake.reply(
      token(),
      conflict('path/insufficient_space/...'),
      conflict('path_lookup/not_found/'),
    );

    const error = await host.share(FILE).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileHostRequestError);
    expect(error).toMatchObject({ status: 409, reason: 'path/insufficient_space' });
    expect(fake.requests).toHaveLength(3);
  });

  it('removes what a failed upload may have stored, keeping the upload error', async () => {
    const lost = () => Promise.reject(new TypeError('fetch failed'));
    const sleep = vi.fn(() => Promise.resolve());
    const retrying = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      ids: new SequentialIds(),
      clock,
      sleep,
    });
    fake.reply(token(), lost, conflict('path/insufficient_space/..'), text('down', 503));

    await expect(retrying.share(FILE)).rejects.toMatchObject({ reason: 'path/insufficient_space' });
    expect(fake.requests.at(-1)?.url).toBe('https://api.dropboxapi.com/2/files/delete_v2');
    expect(await fake.requests.at(-1)?.json()).toEqual({ path: PATH });
  });

  it('uploads a small file again over one whose answer was lost', async () => {
    const retrying = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      ids: new SequentialIds(),
      clock,
      sleep: () => Promise.resolve(),
    });
    fake.reply(token(), () => Promise.reject(new TypeError('fetch failed')), uploaded, linked);

    expect((await retrying.share(FILE)).url).toBe(LINK);
    expect(fake.requests.map((request) => request.url)).not.toContain(
      'https://api.dropboxapi.com/2/files/delete_v2',
    );
  });

  it('finishes an upload session whose last piece arrived although its answer was lost', async () => {
    const big = new Uint8Array([1, 2, 3, 4]);
    const chunked = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile: () => Promise.resolve(big),
      ids: new SequentialIds(),
      clock,
      sleep: () => Promise.resolve(),
      uploadChunkBytes: 3,
    });
    fake.reply(
      token(),
      json({ session_id: 's-1' }),
      () => Promise.reject(new TypeError('fetch failed')),
      conflict('lookup_failed/incorrect_offset/..'),
      linked,
    );

    expect((await chunked.share(FILE)).url).toBe(LINK);
  });

  it('fails without credentials before touching the network', async () => {
    credentials = undefined;

    await expect(host.share(FILE)).rejects.toBeInstanceOf(FileHostNotConnectedError);
    expect(fake.requests).toHaveLength(0);
  });

  it('gives every call its own time limit, uploads the longest', async () => {
    const signal = vi.fn(() => AbortSignal.abort());
    const timed = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      ids: new SequentialIds(),
      clock,
      signal,
    });
    fake.reply(token(), uploaded, linked);

    await timed.share(FILE);

    expect(signal.mock.calls).toEqual([['request'], ['upload', 3], ['request']]);
    expect(fake.requests.every((request) => request.signal.aborted)).toBe(true);
  });

  it('refreshes the token once for calls that start together', async () => {
    fake.reply(token(), uploaded, uploaded, linked, linked);

    await Promise.all([host.share(FILE), host.share(FILE)]);

    expect(fake.requests.filter((request) => request.url.endsWith('/oauth2/token'))).toHaveLength(
      1,
    );
  });

  it('refreshes an expired token once for calls that start together', async () => {
    fake.reply(token(), uploaded, linked);
    await host.share(FILE);
    clock.advance(14_400_000);
    fake.reply(token('access-2'), uploaded, uploaded, linked, linked);

    await Promise.all([host.share(FILE), host.share(FILE)]);

    expect(fake.requests.filter((request) => request.url.endsWith('/oauth2/token'))).toHaveLength(
      2,
    );
  });

  it('waits out a short rate limit once', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    host = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      ids: new SequentialIds(),
      clock,
      sleep,
    });
    fake.reply(token(), json({ error_summary: 'too_many_requests/' }, 429), uploaded, linked);

    expect((await host.share(FILE)).url).toBe(LINK);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('refuses a file larger than one Dropbox upload before sending it', async () => {
    readFile.mockResolvedValueOnce(new Uint8Array(150 * 1024 * 1024 + 1));

    await expect(host.share(FILE)).rejects.toThrow(
      'Dropbox takes files up to 150 MB in one upload; this one is 151 MB',
    );
    expect(fake.requests).toEqual([]);
  });

  it('refuses a file too large by its size on disk without reading it', async () => {
    readFile.mockClear();
    host = new DropboxFileHost({
      credentials: () => Promise.resolve(credentials),
      fetch: fake.fetch,
      readFile,
      fileSize: () => Promise.resolve(150 * 1024 * 1024 + 1),
      ids: new SequentialIds(),
      clock,
    });

    await expect(host.share(FILE)).rejects.toBeInstanceOf(FileTooLargeToShareError);
    expect(readFile).not.toHaveBeenCalled();
    expect(fake.requests).toEqual([]);
  });

  it('refuses a temporary link answer without a link and removes the upload', async () => {
    fake.reply(token(), uploaded, json({ metadata: {} }), json({}));

    await expect(host.share(FILE)).rejects.toBeInstanceOf(FileHostUnexpectedResponseError);
    expect(fake.requests.at(-1)?.url).toBe('https://api.dropboxapi.com/2/files/delete_v2');
  });
});
