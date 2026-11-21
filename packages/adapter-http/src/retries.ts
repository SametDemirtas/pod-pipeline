export interface RetryOptions {
  /** How often a rate-limited request is sent again before its answer is returned. */
  readonly maxRetries: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  /** Seconds to wait after a rate limit; `Retry-After`, or two seconds, by default. */
  readonly waitSeconds?: (response: Response) => Promise<number>;
  /** A longer wait means a daily limit is used up; the answer is returned instead of waiting. */
  readonly maxWaitSeconds?: number;
  /** Forgets the access token after a 401, so one more try gets a fresh one. */
  readonly renew?: () => void;
  /** Statuses besides 429 that are tried again the same way, e.g. 503 for an overloaded service. */
  readonly alsoRetry?: readonly number[];
}

const DEFAULT_WAIT_SECONDS = 2;

/**
 * Seconds from a `Retry-After` header, given as seconds or as an HTTP date,
 * or `fallback` when it has neither.
 */
export function retryAfterSeconds(
  response: { readonly headers: Headers },
  fallback = DEFAULT_WAIT_SECONDS,
): number {
  const header = response.headers.get('Retry-After') ?? '';
  const seconds = /^\d+$/.test(header.trim())
    ? Number(header)
    : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
}

/** Lets go of an answer that is not used, so its connection can be reused. */
export async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Sends a request again after a rate limit, or a status in `alsoRetry`, and
 * once with a fresh token after a 401. Each has its own count, so a renewed
 * token does not use up a retry.
 */
export async function sendWithRetries(
  send: () => Promise<Response>,
  options: RetryOptions,
): Promise<Response> {
  let retries = 0;
  let renewed = false;
  for (;;) {
    const response = await send();
    const limited = response.status === 429 || options.alsoRetry?.includes(response.status);
    if (limited && retries < options.maxRetries) {
      const seconds = await (options.waitSeconds ?? ((r) => Promise.resolve(retryAfterSeconds(r))))(
        response,
      );
      if (options.maxWaitSeconds === undefined || seconds <= options.maxWaitSeconds) {
        retries += 1;
        await discard(response);
        await options.sleep(seconds * 1000);
        continue;
      }
    }
    if (response.status === 401 && options.renew && !renewed) {
      renewed = true;
      options.renew();
      await discard(response);
      continue;
    }
    return response;
  }
}
