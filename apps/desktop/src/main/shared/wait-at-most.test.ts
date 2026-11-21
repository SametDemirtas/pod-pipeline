import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Timers } from './timers.js';
import { closeAllThen, closeWithin, waitAtMost } from './wait-at-most.js';

const timers: Timers = {
  after: (ms, callback) => {
    const timer = setTimeout(callback, ms);
    return () => {
      clearTimeout(timer);
    };
  },
  every: () => () => undefined,
};

const hang = () => new Promise<void>(() => undefined);

describe('waitAtMost', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the work settled in time, also when it failed', async () => {
    expect(await waitAtMost(Promise.resolve('done'), 60_000, timers)).toBe(true);
    expect(await waitAtMost(Promise.reject(new Error('boom')), 60_000, timers)).toBe(true);
  });

  it('gives up on work that hangs once the time is up', async () => {
    vi.useFakeTimers();
    let result: boolean | undefined;
    const waiting = waitAtMost(hang(), 1_000, timers).then((settled) => {
      result = settled;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(result).toBe(false);
  });
});

describe('closeWithin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for each part up to its own limit and names those cut off', async () => {
    vi.useFakeTimers();
    let late: readonly string[] | undefined;
    const closing = closeWithin(
      [
        { close: () => Promise.resolve(), withinMs: 1_000, risk: 'quick' },
        { close: hang, withinMs: 1_000, risk: 'a mockup run is lost' },
        { close: hang, withinMs: 5_000, risk: 'a listing draft may be left on Etsy' },
      ],
      timers,
    ).then((risks) => {
      late = risks;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(late).toBeUndefined();
    await vi.advanceTimersByTimeAsync(4_000);
    await closing;
    expect(late).toEqual(['a mockup run is lost', 'a listing draft may be left on Etsy']);
  });
});

describe('closeAllThen', () => {
  it('closes the store once every part closed in time', async () => {
    const store = { close: vi.fn(() => Promise.resolve()) };
    const logError = vi.fn();

    await closeAllThen(
      [{ close: () => Promise.resolve(), withinMs: 1000, risk: 'x' }],
      store,
      logError,
      timers,
    );

    expect(store.close).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });

  it('leaves the store open and logs what may be lost when a part is late', async () => {
    const store = { close: vi.fn(() => Promise.resolve()) };
    const logError = vi.fn();

    await closeAllThen(
      [
        { close: hang, withinMs: 1, risk: 'a pin may not be saved' },
        { close: () => Promise.resolve(), withinMs: 1000, risk: 'nothing' },
      ],
      store,
      logError,
      timers,
    );

    expect(store.close).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      new Error('Closed while work was still running: a pin may not be saved'),
    );
  });
});
