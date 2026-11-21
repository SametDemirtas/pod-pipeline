import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpDownloader, MAX_DOWNLOAD_BYTES } from './http-downloader.js';
import { DownloadFailedError } from './https-response.js';

let dir: string;
let made = 0;

/** A new file in `directory`, made when missing, as the app makes its downloads. */
function temporaryFileIn(directory: string) {
  return async () => {
    await mkdir(directory, { recursive: true });
    const absolutePath = join(directory, `${String(++made)}.download`);
    return { absolutePath, dispose: () => rm(absolutePath, { force: true }) };
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-download-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function downloader(response: () => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response()));
  return {
    fetch,
    http: new HttpDownloader({ fetch, temporaryFile: temporaryFileIn(join(dir, 'downloads')) }),
  };
}

describe('HttpDownloader', () => {
  it('saves the body to a temporary file and deletes it on dispose', async () => {
    const { fetch, http } = downloader(() => new Response('png bytes'));

    const file = await http.download('https://files.cdn.printful.com/mockup.png');

    expect(fetch).toHaveBeenCalledWith(
      'https://files.cdn.printful.com/mockup.png',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
    expect(readFileSync(file.absolutePath, 'utf8')).toBe('png bytes');
    await file.dispose();
    await file.dispose();
    expect(existsSync(file.absolutePath)).toBe(false);
  });

  it('refuses addresses that are not HTTPS', async () => {
    const { fetch, http } = downloader(() => new Response('x'));

    await expect(http.download('http://example.test/a.png')).rejects.toBeInstanceOf(
      DownloadFailedError,
    );
    await expect(http.download('not a url')).rejects.toThrow('an invalid address');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails on an error status', async () => {
    const { http } = downloader(() => new Response('gone', { status: 404 }));

    await expect(http.download('https://example.test/secret/a.png?sig=x')).rejects.toThrow(
      /^Download from example\.test failed with 404$/,
    );
  });

  it('releases the answer when the temporary file cannot be made', async () => {
    writeFileSync(join(dir, 'taken'), '');
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    const http = new HttpDownloader({
      fetch: () => Promise.resolve(new Response(body)),
      temporaryFile: temporaryFileIn(join(dir, 'taken', 'downloads')),
    });

    await expect(http.download('https://example.test/a.png')).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });

  it('refuses a file announced as too large before writing anything', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    const { http } = downloader(
      () => new Response(body, { headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) } }),
    );

    await expect(http.download('https://example.test/huge.png')).rejects.toThrow('larger than');
    expect(cancel).toHaveBeenCalled();
    expect(existsSync(join(dir, 'downloads'))).toBe(false);
  });

  it('stops and cleans up when the file is too large', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        if (sent > MAX_DOWNLOAD_BYTES + chunk.length) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const { http } = downloader(() => new Response(body));

    await expect(http.download('https://example.test/huge.png')).rejects.toThrow('larger than');
    expect(readdirSync(join(dir, 'downloads'))).toEqual([]);
  });
});
