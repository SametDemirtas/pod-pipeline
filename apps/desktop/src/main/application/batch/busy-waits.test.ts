import { describe, expect, it, vi } from 'vitest';
import { systemTimers } from '../../testing/system-timers.js';
import { ShopSetupMissingError } from '../errors/batch-errors.js';
import { ListingInProgressError } from '../errors/listing-errors.js';
import { MockupsInProgressError } from '../errors/print-errors.js';
import { ProviderBusyError } from '../errors/provider-errors.js';
import { ResearchInProgressError, ResearchRateLimitedError } from '../errors/research-errors.js';
import {
  BUSY_RETRY_MS,
  BatchStoppedError,
  MAX_PROVIDER_REFUSALS,
  MAX_PROVIDER_WAIT_MS,
  PROVIDER_BUSY_RETRY_MS,
  waitWith,
  whenFree,
  type Wait,
} from './busy-waits.js';

describe('whenFree', () => {
  it('asks again after as long as each refusal says, until the service takes the work', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ResearchRateLimitedError(12_300))
      .mockRejectedValueOnce(new ResearchInProgressError())
      .mockRejectedValueOnce(new MockupsInProgressError())
      .mockRejectedValueOnce(new ListingInProgressError())
      .mockRejectedValueOnce(new ProviderBusyError('Claude', 20))
      .mockRejectedValueOnce(new ProviderBusyError('Gemini'))
      .mockResolvedValue('taken');
    const wait = vi.fn<Wait>(() => Promise.resolve());

    await expect(whenFree(operation, wait, new AbortController().signal)).resolves.toBe('taken');
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([
      13_000,
      BUSY_RETRY_MS,
      BUSY_RETRY_MS,
      BUSY_RETRY_MS,
      20_000,
      PROVIDER_BUSY_RETRY_MS,
    ]);
  });

  it('waits at most five minutes for a busy service, and gives up after five refusals', async () => {
    const busy = new ProviderBusyError('Claude', 86_400);
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(busy);
    const wait = vi.fn<Wait>(() => Promise.resolve());

    await expect(whenFree(operation, wait, new AbortController().signal)).rejects.toBe(busy);
    expect(operation).toHaveBeenCalledTimes(MAX_PROVIDER_REFUSALS + 1);
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual(
      Array.from({ length: MAX_PROVIDER_REFUSALS }, () => MAX_PROVIDER_WAIT_MS),
    );
  });

  it('waits the usual time when a refusal names no usable wait', async () => {
    const odd = (seconds: unknown) =>
      Object.assign(new ProviderBusyError('Claude'), { details: { retryAfterSeconds: seconds } });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(odd(Number.NaN))
      .mockRejectedValueOnce(odd(-5))
      .mockRejectedValueOnce(
        Object.assign(new ResearchRateLimitedError(1), { details: { retryAfterSeconds: 'soon' } }),
      )
      .mockResolvedValue('taken');
    const wait = vi.fn<Wait>(() => Promise.resolve());

    await whenFree(operation, wait, new AbortController().signal);

    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([
      PROVIDER_BUSY_RETRY_MS,
      PROVIDER_BUSY_RETRY_MS,
      BUSY_RETRY_MS,
    ]);
  });

  it('passes on any other failure at once', async () => {
    const wait = vi.fn<Wait>(() => Promise.resolve());

    await expect(
      whenFree(
        () => Promise.reject(new ShopSetupMissingError()),
        wait,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ShopSetupMissingError);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('waitWith', () => {
  it('resolves after the time, or stops as soon as the signal aborts', async () => {
    vi.useFakeTimers();
    try {
      const waitFor = waitWith(systemTimers);
      const stop = new AbortController();
      const done = vi.fn();
      void waitFor(1000, stop.signal).then(done);
      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toHaveBeenCalled();

      const waiting = waitFor(60_000, stop.signal);
      stop.abort();
      await expect(waiting).rejects.toBeInstanceOf(BatchStoppedError);
      await expect(waitFor(1, stop.signal)).rejects.toBeInstanceOf(BatchStoppedError);
    } finally {
      vi.useRealTimers();
    }
  });
});
