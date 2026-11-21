import { Transform } from 'node:stream';

/** The provider's file could not be fetched; nothing was written. */
export class DownloadFailedError extends Error {
  constructor(url: string, reason: string) {
    super(`Download from ${hostOf(url)} ${reason}`);
    this.name = new.target.name;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'an invalid address';
  }
}

function isHttpsUrl(url: string): boolean {
  return URL.canParse(url) && new URL(url).protocol === 'https:';
}

export interface HttpsResponse {
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array>;
}

/**
 * Fetches an HTTPS address and hands over its body unread. No redirect is
 * followed, since one could lead off HTTPS, and a body announced as larger
 * than `maxBytes` is refused before any of it arrives.
 */
export async function fetchHttps(
  fetchFn: typeof fetch,
  url: string,
  options: { readonly maxBytes: number; readonly timeoutMs: number },
): Promise<HttpsResponse> {
  if (!isHttpsUrl(url)) {
    throw new DownloadFailedError(url, 'was refused: only HTTPS is allowed');
  }
  const response = await fetchFn(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new DownloadFailedError(url, `failed with ${response.status}`);
  }
  if (Number(response.headers.get('content-length')) > options.maxBytes) {
    await response.body.cancel();
    throw new DownloadFailedError(url, `is larger than ${options.maxBytes} bytes`);
  }
  return { headers: response.headers, body: response.body };
}

/** Passes the bytes on and fails once more than `maxBytes` came, whatever the server announced. */
export function limitSize(url: string, maxBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes)
        callback(new DownloadFailedError(url, `is larger than ${maxBytes} bytes`));
      else callback(null, chunk);
    },
  });
}
