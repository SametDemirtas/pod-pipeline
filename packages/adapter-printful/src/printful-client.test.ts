import { describe, expect, it, vi } from 'vitest';
import { FakeFetch } from '@pod/adapter-http/testing';
import { PrintfulApiError, PrintfulNotConnectedError } from './errors.js';
import { PRINTFUL_API, PrintfulClient } from './printful-client.js';
import { ok } from './testing/fake-fetch.js';

function clientFor(fake: FakeFetch, token: string | null = 'secret') {
  const sleep = vi.fn<(milliseconds: number, signal?: AbortSignal) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const signal = new AbortController().signal;
  const client = new PrintfulClient({
    fetch: fake.fetch,
    token: () => Promise.resolve(token ?? undefined),
    sleep,
    signal,
  });
  return { client, sleep, signal };
}

describe('PrintfulClient', () => {
  it('sends the token and its own user agent, and returns the result', async () => {
    const fake = new FakeFetch().reply(ok({ id: 19 }));
    const { client } = clientFor(fake);

    expect(await client.get('/products/19')).toEqual({ id: 19 });
    expect(fake.requests).toEqual([
      {
        url: `${PRINTFUL_API}/products/19`,
        method: 'GET',
        headers: {
          Authorization: 'Bearer secret',
          'User-Agent': 'pod-pipeline',
          Accept: 'application/json',
        },
        body: undefined,
      },
    ]);
  });

  it('posts JSON bodies', async () => {
    const fake = new FakeFetch().reply(ok({ task_key: 'k' }));
    const { client } = clientFor(fake);

    await client.post('/tasks', { a: 1 });

    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { a: 1 },
    });
  });

  it('refuses to call Printful without a token', async () => {
    const fake = new FakeFetch();
    const { client } = clientFor(fake, null);

    await expect(client.get('/products/19')).rejects.toBeInstanceOf(PrintfulNotConnectedError);
    expect(fake.requests).toEqual([]);
  });

  it.each([
    [
      { code: 404, result: 'Not found', error: { reason: 'NotFound', message: 'No product' } },
      'No product',
    ],
    [{ code: 400, result: 'Bad variant' }, 'Bad variant'],
    ['<html>blocked</html>', 'Forbidden'],
  ])('reports Printful errors with their message (%#)', async (body, message) => {
    const status = typeof body === 'string' ? 403 : body.code;
    const fake = new FakeFetch().reply({ status, body });
    const { client } = clientFor(fake);

    const error = await client.get('/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PrintfulApiError);
    expect(error).toMatchObject({ status });
    expect((error as Error).message).toContain(typeof body === 'string' ? '403' : message);
  });

  it('waits as long as Printful asks when rate limited, then retries', async () => {
    const fake = new FakeFetch().reply(
      { status: 429, headers: { 'Retry-After': '7' } },
      { status: 429 },
      ok('done'),
    );
    const { client, sleep, signal } = clientFor(fake);

    expect(await client.get('/x')).toBe('done');
    // The client's signal goes with each wait, so a cancel does not sit it out.
    expect(sleep.mock.calls).toEqual([
      [7000, signal],
      [60000, signal],
    ]);
  });

  it('returns a rate limit that asks for longer than a minute instead of waiting', async () => {
    const fake = new FakeFetch().reply({
      status: 429,
      headers: { 'Retry-After': '3600' },
      body: { code: 429, result: 'Daily limit reached' },
    });
    const { client, sleep } = clientFor(fake);

    await expect(client.get('/x')).rejects.toMatchObject({ status: 429 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reads the wait from the message when there is no Retry-After header', async () => {
    const fake = new FakeFetch().reply(
      { status: 429, body: { code: 429, result: 'Too many requests. Try again after 45 seconds' } },
      ok('done'),
    );
    const { client, sleep } = clientFor(fake);

    expect(await client.get('/x')).toBe('done');
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([45000]);
  });

  it('fails at once on a rate limit when retrying is turned off', async () => {
    const fake = new FakeFetch().reply({ status: 429, body: { code: 429, result: 'slow down' } });
    const { client, sleep } = clientFor(fake);

    await expect(client.get('/x', { retry: false })).rejects.toMatchObject({ status: 429 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after a few rate-limited attempts', async () => {
    const limited = { status: 429, body: { code: 429, result: 'Too many requests' } };
    const fake = new FakeFetch().reply(limited, limited, limited, limited);
    const { client, sleep } = clientFor(fake);

    await expect(client.get('/x')).rejects.toMatchObject({ status: 429 });
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('fails when a successful response is not an envelope', async () => {
    const fake = new FakeFetch().reply({ body: '[]' });
    const { client } = clientFor(fake);

    await expect(client.get('/x')).rejects.toThrow(/not an object/);
  });

  it('times out requests by default', async () => {
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response(JSON.stringify({ code: 200, result: 1 })));
    });
    const client = new PrintfulClient({ fetch, token: () => Promise.resolve('t') });

    expect(await client.get('/x')).toBe(1);
  });

  it('stops a request when the given signal does', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    // Like Node's fetch, an aborted signal fails the request before anything is sent.
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      init?.signal?.aborted
        ? Promise.reject(init.signal.reason as Error)
        : Promise.resolve(new Response(JSON.stringify({ code: 200, result: 1 }))),
    );
    const client = new PrintfulClient({
      fetch,
      token: () => Promise.resolve('t'),
      signal: cancelled.signal,
    });

    await expect(client.get('/x')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
