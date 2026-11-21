import { describe, expect, it } from 'vitest';
import { sendSignedIn } from './signed-in-send.js';

describe('sendSignedIn', () => {
  it('builds each try afresh and signs in again once after a refused token', async () => {
    const statuses = [401, 200];
    const seen: (string | null)[] = [];
    let token = 'old';
    const fetchFn: typeof fetch = (_input, init) => {
      seen.push(new Headers(init?.headers).get('authorization'));
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response('{}', { status: statuses.shift() ?? 200 }));
    };

    const response = await sendSignedIn(
      'https://shop.test/v1/me',
      () => Promise.resolve({ headers: { Authorization: `Bearer ${token}` } }),
      1000,
      {
        fetch: fetchFn,
        sleep: () => Promise.resolve(),
        maxRetries: 3,
        session: {
          invalidate: () => {
            token = 'new';
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
  });

  it('returns a rate limit that asks for longer than a minute instead of waiting', async () => {
    const waits: number[] = [];
    const limited = () =>
      Promise.resolve(new Response('{}', { status: 429, headers: { 'Retry-After': '3600' } }));

    const response = await sendSignedIn('https://shop.test/v1', () => Promise.resolve({}), 1000, {
      fetch: limited,
      sleep: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
      maxRetries: 3,
      session: { invalidate: () => undefined },
    });

    expect(response.status).toBe(429);
    expect(waits).toEqual([]);
  });

  it('hands the cancel signal to each wait, so a cancel ends it', async () => {
    const statuses = [429, 200];
    const cancel = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];

    await sendSignedIn('https://shop.test/v1', () => Promise.resolve({}), 1000, {
      fetch: () => Promise.resolve(new Response('{}', { status: statuses.shift() ?? 200 })),
      sleep: (_milliseconds, signal) => {
        signals.push(signal);
        return Promise.resolve();
      },
      maxRetries: 3,
      signal: cancel.signal,
      session: { invalidate: () => undefined },
    });

    expect(signals).toEqual([cancel.signal]);
  });
});
