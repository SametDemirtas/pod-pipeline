import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppClosingError } from '../../shared/app-error.js';
import { systemTimers as timers } from '../../testing/system-timers.js';
import { PinScheduler } from './pin-scheduler.js';

describe('PinScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes at start and then every interval, logging failures', async () => {
    vi.useFakeTimers();
    const error = new Error('offline');
    const publishDue = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(error)
      .mockResolvedValue([]);
    const logError = vi.fn();
    const scheduler = new PinScheduler({ publishDue, logError, timers, intervalMs: 1_000 });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(2_000);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(publishDue).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledWith(error);
  });

  it('does not log a run refused because the app is closing', async () => {
    const logError = vi.fn();
    const scheduler = new PinScheduler({
      publishDue: () => Promise.reject(new AppClosingError()),
      logError,
      timers,
    });

    scheduler.start();
    await scheduler.stop();

    expect(logError).not.toHaveBeenCalled();
  });

  it('waits for a publish under way when stopping', async () => {
    let finish: () => void = () => undefined;
    const scheduler = new PinScheduler({
      publishDue: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve([]);
          };
        }),
      logError: vi.fn(),
      timers,
    });
    scheduler.start();
    let stopped = false;

    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('skips a tick while the previous run is still going', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const publishDue = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          finish = () => {
            resolve([]);
          };
        }),
    );
    const scheduler = new PinScheduler({
      publishDue,
      logError: vi.fn(),
      timers,
      intervalMs: 1_000,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(publishDue).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(2);
    finish();
    await scheduler.stop();
  });
});
