import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TemporaryFile, FileDownloader } from '@pod/core';
import { fetchHttps, limitSize } from './https-response.js';

/** Mockups are a few megabytes; anything far larger is not what was asked for. */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export interface HttpDownloaderOptions {
  readonly fetch: typeof fetch;
  /** A new temporary file to write into, which the caller of `download` disposes of. */
  readonly temporaryFile: () => Promise<TemporaryFile>;
  readonly timeoutMs?: number;
}

/** Downloads provider files over HTTPS into temporary files. */
export class HttpDownloader implements FileDownloader {
  constructor(private readonly options: HttpDownloaderOptions) {}

  async download(url: string): Promise<TemporaryFile> {
    const { body } = await fetchHttps(this.options.fetch, url, {
      maxBytes: MAX_DOWNLOAD_BYTES,
      timeoutMs: this.options.timeoutMs ?? 60_000,
    });
    const file = await this.options.temporaryFile().catch(async (error: unknown) => {
      await body.cancel();
      throw error;
    });
    try {
      await pipeline(
        Readable.fromWeb(body),
        limitSize(url, MAX_DOWNLOAD_BYTES),
        createWriteStream(file.absolutePath, { flags: 'wx' }),
      );
    } catch (error) {
      await file.dispose();
      throw error;
    }
    return file;
  }
}
