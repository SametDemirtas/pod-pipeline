import { InProgressError } from '../errors/in-progress.js';
import { ProviderBusyError } from '../errors/provider-errors.js';
import { ResearchRateLimitedError } from '../errors/research-errors.js';
import { DEFAULT_BUSY_WAIT_SECONDS } from '@pod/rules';
import type { Timers } from '../../shared/timers.js';
import { WorkStoppedError } from '../errors/work-stopped.js';

/** Waits `ms`, or rejects with {@link BatchStoppedError} once `signal` aborts. */
export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

/** How long to wait before asking again when the window holds the service. */
export const BUSY_RETRY_MS = 10_000;
/** How long to wait for a busy outside service that did not say how long. */
export const PROVIDER_BUSY_RETRY_MS = DEFAULT_BUSY_WAIT_SECONDS * 1000;
/** The longest one wait for a busy outside service, whatever it asked for. */
export const MAX_PROVIDER_WAIT_MS = 5 * 60_000;
/**
 * Refusals of a busy outside service after which the design fails as busy, so
 * one step waits for it 25 minutes at most.
 */
export const MAX_PROVIDER_REFUSALS = 5;

/** The job was cancelled or the app is closing while a step waited. */
export class BatchStoppedError extends WorkStoppedError {
  constructor() {
    super('Preparing listings stopped');
  }
}

/** A {@link Wait} on the given timers. */
export function waitWith(timers: Pick<Timers, 'after'>): Wait {
  return (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new BatchStoppedError());
        return;
      }
      const stop = () => {
        cancel();
        reject(new BatchStoppedError());
      };
      const cancel = timers.after(ms, () => {
        signal.removeEventListener('abort', stop);
        resolve();
      });
      signal.addEventListener('abort', stop, { once: true });
    });
}

/** Seconds as milliseconds, or `fallback` for a value that is not a usable wait. */
function waitMs(seconds: unknown, fallback: number): number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : fallback;
}

/** How long the refusal asks to wait; `null` for errors that are not about being busy. */
function busyFor(error: unknown): number | null {
  if (error instanceof ResearchRateLimitedError) {
    return waitMs(error.details['retryAfterSeconds'], BUSY_RETRY_MS);
  }
  return error instanceof InProgressError ? BUSY_RETRY_MS : null;
}

/** How long a busy outside service asked to wait, at most {@link MAX_PROVIDER_WAIT_MS}. */
function providerWait(error: ProviderBusyError): number {
  return Math.min(
    waitMs(error.details['retryAfterSeconds'], PROVIDER_BUSY_RETRY_MS),
    MAX_PROVIDER_WAIT_MS,
  );
}

/**
 * Runs `operation` until the service takes it. A service refuses work while
 * the window or an assistant uses it, while Etsy must not be searched yet, or
 * while an outside service is busy; nothing was done or billed then, so asking
 * again later is safe. A busy outside service is asked a few times only, so
 * one that stays busy fails the design instead of holding up the job. Work
 * the window or an assistant runs, and Etsy's search pace, are waited for as
 * long as they last: they end on their own, and cancelling stops the wait.
 */
export async function whenFree<T>(
  operation: () => Promise<T>,
  wait: Wait,
  signal: AbortSignal,
): Promise<T> {
  let refusals = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProviderBusyError) {
        const ms = providerWait(error);
        refusals += 1;
        if (refusals > MAX_PROVIDER_REFUSALS) throw error;
        await wait(ms, signal);
        continue;
      }
      const ms = busyFor(error);
      if (ms === null) throw error;
      await wait(ms, signal);
    }
  }
}
