import { describe, expect, it, vi } from 'vitest';
import { retryAfterSeconds, sendWithRetries } from './retries.js';

const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : `{"status":${String(status)}}`, { status, headers });

function sender(...statuses: Response[]) {
  const send = vi.fn(() => Promise.resolve(statuses.shift() ?? reply(200)));
  return send;
}

describe('sendWithRetries', () => {
  it('waits as long as the service asks, up to the retries allowed', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = sender(reply(429, { 'Retry-After': '3' }), reply(429), reply(429));

    const response = await sendWithRetries(send, { maxRetries: 2, sleep });

    expect(response.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[3000], [2000]]);
  });

  it('tries the other statuses it is given the same way, and no others', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const overloaded = sender(reply(503), reply(200));
    const broken = sender(reply(500));

    expect(
      (await sendWithRetries(overloaded, { maxRetries: 1, sleep, alsoRetry: [503] })).status,
    ).toBe(200);
    expect((await sendWithRetries(broken, { maxRetries: 1, sleep, alsoRetry: [503] })).status).toBe(
      500,
    );
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('gives up at once on a wait longer than allowed', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = sender(reply(429, { 'Retry-After': '3600' }));

    expect((await sendWithRetries(send, { maxRetries: 3, sleep, maxWaitSeconds: 60 })).status).toBe(
      429,
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('renews the token once after a 401 without using up a rate-limit retry', async () => {
    const renew = vi.fn();
    const send = sender(reply(401), reply(429), reply(401), reply(200));

    const response = await sendWithRetries(send, {
      maxRetries: 1,
      sleep: () => Promise.resolve(),
      renew,
    });

    expect(response.status).toBe(401);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('reads the wait the way a service states it', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = sender(reply(429), reply(200));

    await sendWithRetries(send, {
      maxRetries: 1,
      sleep,
      waitSeconds: async (response) => Number(/(\d+)/.exec(await response.text())?.[1]),
    });

    expect(sleep).toHaveBeenCalledWith(429_000);
  });

  it('reads Retry-After, or falls back', () => {
    expect(retryAfterSeconds(reply(429, { 'Retry-After': '5' }))).toBe(5);
    expect(retryAfterSeconds(reply(429, { 'Retry-After': 'soon' }), 7)).toBe(7);
  });

  it('reads a Retry-After date as the seconds until then', () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    try {
      expect(
        retryAfterSeconds(reply(429, { 'Retry-After': 'Thu, 01 Jan 2026 00:00:30 GMT' })),
      ).toBe(30);
      expect(
        retryAfterSeconds(reply(429, { 'Retry-After': 'Wed, 31 Dec 2025 23:59:00 GMT' }), 7),
      ).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
});
