import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './timeout-signal.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withTimeout', () => {
  it("aborts with the caller's signal, and is a plain timeout without one", () => {
    const cancel = new AbortController();
    const combined = withTimeout(cancel.signal, 60_000);
    const alone = withTimeout(undefined, 60_000);

    expect(combined.aborted).toBe(false);
    cancel.abort();
    expect(combined.aborted).toBe(true);
    expect(alone.aborted).toBe(false);
  });

  it('aborts with a timeout once the time is up', () => {
    // Fake timers do not reach AbortSignal.timeout, so the timeout is stood in for.
    const timeout = new AbortController();
    const timed = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const signal = withTimeout(new AbortController().signal, 1_000);

    expect(timed).toHaveBeenCalledWith(1_000);
    expect(signal.aborted).toBe(false);
    timeout.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).name).toBe('TimeoutError');
  });
});
