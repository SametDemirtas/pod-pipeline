import { describe, expect, it } from 'vitest';
import { PINTEREST_FAILURES } from './classify-error.js';
import { PinterestApiError, PinterestSignInError } from './errors.js';
import { clientWith } from './testing/fake-fetch.js';

describe('PinterestClient', () => {
  it('sends JSON with the access token', async () => {
    const { client, calls } = clientWith({ body: { id: '1' } });

    expect(await client.post('/pins', { a: 1 })).toEqual({ id: '1' });
    expect(calls()[0]).toMatchObject({
      url: 'https://api.pinterest.com/v5/pins',
      method: 'POST',
      headers: { Authorization: 'Bearer pina_access', 'Content-Type': 'application/json' },
      body: { a: 1 },
    });
  });

  it('waits out a short rate limit and gives up on a long one', async () => {
    const short = clientWith(
      { status: 429, headers: { 'Retry-After': '1' } },
      { body: { items: [] } },
    );
    expect(await short.client.get('/boards')).toEqual({ items: [] });

    const long = clientWith({
      status: 429,
      headers: { 'Retry-After': '3600' },
      body: { code: 8, message: 'Rate limit exceeded' },
    });
    await expect(long.client.get('/boards')).rejects.toThrow(/Rate limit exceeded/);
  });

  it('tries one fresh token after a 401', async () => {
    const { client, fake } = clientWith(
      { status: 401, body: { message: 'expired' } },
      { body: { access_token: 'fresh', refresh_token: 'refresh-3' } },
      { body: { ok: true } },
    );

    expect(await client.get('/boards')).toEqual({ ok: true });
    expect(fake.requests.at(-1)?.headers['Authorization']).toBe('Bearer fresh');
  });

  it.each([
    ['a fault on its side', { status: 502, body: 'not json' }, 'failed'],
    ['a refused sign-in', { status: 400, body: { error: 'invalid_grant' } }, 'not-connected'],
  ] as const)(
    'tells a token refresh that ends in %s apart from the request, which was not sent',
    async (_case, tokenReply, kind) => {
      const { client, fake } = clientWith(
        { status: 401, body: { message: 'expired' } },
        tokenReply,
      );

      const error = await client.post('/pins', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(PinterestSignInError);
      expect(PINTEREST_FAILURES.classify(error)).toMatchObject({ kind });
      // The first sign-in, the refused request and the refresh; the request is not sent again.
      expect(fake.requests).toHaveLength(3);
    },
  );

  it('reports errors with Pinterest’s message or the status text', async () => {
    const { client } = clientWith(
      { status: 400, body: { code: 1, message: 'Invalid board' } },
      { status: 502, body: 'not json' },
      { status: 204 },
    );

    await expect(client.post('/pins', {})).rejects.toEqual(
      new PinterestApiError(400, 'Invalid board'),
    );
    await expect(client.get('/boards')).rejects.toThrow(/Pinterest returned 502/);
    expect(await client.get('/empty')).toBeUndefined();
  });
});
