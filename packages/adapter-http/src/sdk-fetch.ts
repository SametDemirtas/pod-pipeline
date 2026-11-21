import { retryAfterSeconds, sendWithRetries } from './retries.js';
import { sleep as realSleep } from './sleep.js';
import type { SdkClientSettings } from './sdk-errors.js';

/**
 * Answers an AI service gives when it could not take the request, which bill
 * nothing. 500, 502 and 504 may come after the work was done, so they are not sent again.
 */
const BUSY_STATUSES: readonly number[] = [503, 529];

/** A longer wait is a limit the seller should see rather than sit out. */
const MAX_WAIT_SECONDS = 30;

export interface AnsweredRetries {
  readonly timeout: number;
  /** How often a request turned away with 429 or a busy status is sent again. */
  readonly retries: number;
  readonly fetch?: typeof fetch | undefined;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

/** Seconds from the SDKs' `retry-after-ms` header, else `Retry-After`, else one. */
function waitSeconds(response: Response): Promise<number> {
  const milliseconds = Number(response.headers.get('retry-after-ms') ?? Number.NaN);
  return Promise.resolve(
    Number.isFinite(milliseconds) && milliseconds >= 0
      ? milliseconds / 1000
      : retryAfterSeconds(response, 1),
  );
}

/**
 * SDK settings that never send a request again after a timeout or a lost
 * connection, which the service may have answered and billed, and send it
 * again only when the service answered that it could not take it.
 */
export function sdkSettings(options: AnsweredRetries): SdkClientSettings {
  const send = options.fetch ?? fetch;
  const pause = options.sleep ?? realSleep;
  const fetchFn: typeof fetch = (input, init) =>
    sendWithRetries(() => send(input, init), {
      maxRetries: options.retries,
      alsoRetry: BUSY_STATUSES,
      maxWaitSeconds: MAX_WAIT_SECONDS,
      waitSeconds,
      sleep: (milliseconds) => pause(milliseconds, init?.signal ?? undefined),
    });
  return {
    timeout: options.timeout,
    maxRetries: 0,
    fetch: Object.assign(fetchFn, { Response }),
  };
}
