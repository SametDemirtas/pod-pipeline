import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fetchHttps, limitSize } from './https-response.js';

/** Small copies only: a photo larger than this is not shown. */
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

/**
 * Downloads a small image Etsy or Printful host and returns it as a data URL,
 * so the window can show it while its content policy keeps other sites out.
 * Resolves to `null` when it cannot be had; the link to the photo still works.
 */
export function remoteThumbnails(fetchFn: typeof fetch) {
  return async (url: string): Promise<string | null> => {
    try {
      const { headers, body } = await fetchHttps(fetchFn, url, {
        maxBytes: MAX_THUMBNAIL_BYTES,
        timeoutMs: TIMEOUT_MS,
      });
      const type = headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) {
        await body.cancel();
        return null;
      }
      const chunks: Buffer[] = [];
      await pipeline(
        Readable.fromWeb(body),
        limitSize(url, MAX_THUMBNAIL_BYTES),
        async (source: AsyncIterable<Buffer>) => {
          for await (const chunk of source) chunks.push(chunk);
        },
      );
      return `data:${type.split(';')[0]};base64,${Buffer.concat(chunks).toString('base64')}`;
    } catch {
      return null;
    }
  };
}
