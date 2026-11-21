import { describe, expect, it, vi } from 'vitest';
import { sleep } from './sleep.js';

describe('sleep', () => {
  it('waits on a real timer', async () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      const sleeping = sleep(1000).then(done);
      await vi.advanceTimersByTimeAsync(999);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await sleeping;
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sleep with a signal', () => {
  it('stops waiting with the reason once the signal aborts', async () => {
    const controller = new AbortController();
    const sleeping = sleep(60_000, controller.signal);
    controller.abort(new Error('stopped'));

    await expect(sleeping).rejects.toThrow('stopped');
    await expect(sleep(1, controller.signal)).rejects.toThrow('stopped');
  });
});
