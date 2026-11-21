import { sendWithRetries } from './retries.js';
import { withTimeout } from './timeout-signal.js';

/** A longer wait means a daily limit is used up; better to say so than to hang. */
const MAX_RETRY_SECONDS = 60;

/** The access token a signed-in client sends, and how it drops one the service refused. */
export interface AccessTokens {
  accessToken(): Promise<string>;
  /** Called when the service rejected the token, before asking for one again. */
  invalidate(): void;
}

export interface SignedInSendOptions {
  readonly fetch: typeof fetch;
  /** Waits out a rate limit; given `signal`, so a cancel does not sit out the wait. */
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** How often a rate-limited request is tried again before its answer is returned. */
  readonly maxRetries: number;
  /** Stops every request, e.g. when the seller cancels. */
  readonly signal?: AbortSignal | undefined;
  readonly session: Pick<AccessTokens, 'invalidate'>;
}

/**
 * Sends a request as the signed-in seller: `request` builds it afresh for each
 * try, with the current token. Rate limits are waited out up to a minute, and
 * a refused token is dropped once so the next try signs in again.
 */
export function sendSignedIn(
  url: string,
  request: () => Promise<Omit<RequestInit, 'signal'>>,
  timeoutMs: number,
  options: SignedInSendOptions,
): Promise<Response> {
  const { session } = options;
  return sendWithRetries(
    async () =>
      options.fetch(url, { ...(await request()), signal: withTimeout(options.signal, timeoutMs) }),
    {
      maxRetries: options.maxRetries,
      sleep: (milliseconds) => options.sleep(milliseconds, options.signal),
      maxWaitSeconds: MAX_RETRY_SECONDS,
      // An access token can be revoked before it expires; one fresh token is worth a try.
      renew: () => {
        session.invalidate();
      },
    },
  );
}
