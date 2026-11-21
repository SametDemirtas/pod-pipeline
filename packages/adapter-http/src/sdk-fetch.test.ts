import { describe, expect, it } from 'vitest';
import { sdkSettings } from './sdk-fetch.js';

function answering(...statuses: number[]) {
  const sent: unknown[] = [];
  const fetchFn: typeof fetch = (input) => {
    sent.push(input);
    const status = statuses.shift() ?? 200;
    return Promise.resolve(
      new Response('{}', { status, headers: status === 200 ? {} : { 'retry-after-ms': '0' } }),
    );
  };
  return { sent, fetchFn };
}

const settingsFor = (fetchFn: typeof fetch, waits: number[] = []) =>
  sdkSettings({
    timeout: 1000,
    retries: 1,
    fetch: fetchFn,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });

describe('sdkSettings', () => {
  it('turns off the SDK retries, which also resend timed-out requests', () => {
    expect(settingsFor(answering().fetchFn)).toMatchObject({ timeout: 1000, maxRetries: 0 });
  });

  it('sends again once after a rate limit or a busy answer', async () => {
    for (const status of [429, 503, 529]) {
      const { sent, fetchFn } = answering(status, status);
      const response = await settingsFor(fetchFn).fetch?.('https://ai.test/v1');

      expect(response?.status).toBe(status);
      expect(sent).toHaveLength(2);
    }
  });

  it('waits as the retry-after-ms header asks, else Retry-After', async () => {
    const waits: number[] = [];
    const later = () =>
      Promise.resolve(new Response('{}', { status: 429, headers: { 'retry-after': '3' } }));

    await settingsFor(later, waits).fetch?.('https://ai.test/v1');
    await settingsFor(answering(529).fetchFn, waits).fetch?.('https://ai.test/v1');

    expect(waits).toEqual([3000, 0]);
  });

  it('never sends again after a request that got no answer', async () => {
    let tries = 0;
    const broken: typeof fetch = () => {
      tries += 1;
      return Promise.reject(new TypeError('fetch failed'));
    };

    await expect(settingsFor(broken).fetch?.('https://ai.test/v1')).rejects.toThrow('fetch failed');
    expect(tries).toBe(1);
  });

  it.each([400, 500, 502, 504])('passes %i on as it is, without sending again', async (status) => {
    const { sent, fetchFn } = answering(status);

    expect((await settingsFor(fetchFn).fetch?.('https://ai.test/v1'))?.status).toBe(status);
    expect(sent).toHaveLength(1);
  });
});
