import { classifyNetworkError, type ServiceFailure } from './failures.js';
import { retryAfterSeconds } from './retries.js';
import type { ErrorClass } from './service-errors.js';

/** How an AI service's SDK client is made: its time limit, retries and fetch. */
export interface SdkClientSettings {
  readonly timeout: number;
  readonly maxRetries: number;
  readonly fetch?: typeof fetch | undefined;
}

/** An AI service SDK's errors for a request that timed out or lost its connection. */
export interface SdkConnectionErrors {
  readonly timeout: ErrorClass;
  readonly connection: ErrorClass;
}

/**
 * A timed-out or broken request of an SDK as interrupted, one that never got
 * there as unreachable; `undefined` for other errors. The SDKs' connection
 * errors are API errors too, so callers ask this first.
 */
export function classifySdkConnectionError(
  error: unknown,
  service: string,
  sdk: SdkConnectionErrors,
): ServiceFailure | undefined {
  if (error instanceof sdk.timeout) return { kind: 'interrupted', service, reason: 'timed out' };
  if (!(error instanceof sdk.connection)) return undefined;
  const network = classifyNetworkError(error.cause);
  if (network?.kind === 'unreachable') return { kind: 'unreachable', service };
  return { kind: 'interrupted', service, reason: network?.reason ?? 'connection lost' };
}

/** A service that turned a request away for now, with the wait it asked for, if any. */
export function busyFailure(service: string, retryAfter?: number): ServiceFailure {
  return {
    kind: 'busy',
    service,
    ...(retryAfter !== undefined && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

/**
 * The seconds an SDK error's `Retry-After` header asks to wait, if it has one.
 * SDKs type their errors' headers loosely, so anything but `Headers` counts as none.
 */
export function retryAfterOf(headers: unknown): number | undefined {
  const seconds = headers instanceof Headers ? retryAfterSeconds({ headers }, 0) : 0;
  return seconds > 0 ? seconds : undefined;
}
