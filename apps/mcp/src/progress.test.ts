import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROGRESS_INTERVAL_MS, withProgress } from './progress.js';

type Extra = Parameters<typeof withProgress>[0];

function fakeExtra(progressToken?: string) {
  const sendNotification = vi.fn(() => Promise.resolve());
  const extra = { _meta: progressToken ? { progressToken } : undefined, sendNotification };
  return { extra: extra as unknown as Extra, sendNotification };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('withProgress', () => {
  it('reports progress until the work settles', async () => {
    vi.useFakeTimers();
    const { extra, sendNotification } = fakeExtra('token-1');
    let finish: (value: string) => void = () => undefined;
    const running = withProgress(
      extra,
      'still working',
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );

    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS * 2);
    finish('done');
    expect(await running).toBe('done');
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS * 2);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenLastCalledWith({
      method: 'notifications/progress',
      params: { progressToken: 'token-1', progress: 2, message: 'still working' },
    });
  });

  it('stays silent when the client did not ask for progress', async () => {
    vi.useFakeTimers();
    const { extra, sendNotification } = fakeExtra();

    const result = withProgress(extra, 'x', Promise.resolve(1));
    await vi.advanceTimersByTimeAsync(PROGRESS_INTERVAL_MS * 3);

    expect(await result).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
