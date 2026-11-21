import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETSY_API } from './etsy-client.js';
import { EtsyApiError } from './errors.js';
import { clientWith, TOKEN_REPLY } from './testing/fake-fetch.js';

describe('EtsyClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives uploads and requests that ask for it more time', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { client } = clientWith({}, {}, {});

    await client.get('/a');
    await client.post('/b', { multipart: new FormData() });
    await client.post('/c', { form: {} }, 120_000);

    // The first timeout belongs to the token refresh.
    expect(timeout.mock.calls.slice(1).map(([milliseconds]) => milliseconds)).toEqual([
      30_000, 60_000, 120_000,
    ]);
  });

  it('signs every request with the app key, its secret and the seller token', async () => {
    const { client, calls } = clientWith({ body: { shop_id: 1 } });

    expect(await client.get('/users/me')).toEqual({ shop_id: 1 });
    expect(calls()[0]).toMatchObject({
      url: `${ETSY_API}/users/me`,
      method: 'GET',
      headers: {
        'x-api-key': 'key:secret',
        Authorization: 'Bearer 1001001.access',
        Accept: 'application/json',
      },
    });
  });

  it('sends forms, JSON and multipart bodies with the right type', async () => {
    const { client, calls } = clientWith({}, {}, { status: 204 });
    const form = new FormData();

    await client.patch('/a', { form: { state: 'active' } });
    await client.put('/b', { json: { products: [] } });
    expect(await client.post('/c', { multipart: form })).toBeUndefined();

    const [patch, put, post] = calls();
    expect(patch?.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(patch?.body).toEqual({ state: 'active' });
    expect(put?.headers['Content-Type']).toBe('application/json');
    expect(put?.body).toEqual({ products: [] });
    expect(post?.headers['Content-Type']).toBeUndefined();
    expect(post?.body).toBe(form);
  });

  it('waits and tries again when rate limited', async () => {
    const { client, calls } = clientWith(
      { status: 429, body: { error: 'slow down' }, headers: { 'Retry-After': '1' } },
      { status: 429, body: { error: 'slow down' } },
      { body: { ok: true } },
    );

    expect(await client.delete('/listings/1')).toEqual({ ok: true });
    expect(calls()).toHaveLength(3);
  });

  it('renews a rejected token once', async () => {
    const { client, fake } = clientWith(
      { status: 401, body: { error: 'invalid_token' } },
      TOKEN_REPLY,
      { body: { ok: true } },
      { status: 401, body: { error: 'invalid_token' } },
      TOKEN_REPLY,
      { status: 401, body: { error: 'invalid_token' } },
    );

    expect(await client.get('/a')).toEqual({ ok: true });
    expect(fake.requests.filter((request) => request.url.includes('oauth'))).toHaveLength(2);
    await expect(client.get('/b')).rejects.toThrow(EtsyApiError);
    expect(fake.requests).toHaveLength(7);
  });

  it('reports Etsy errors with their message or status text', async () => {
    const { client } = clientWith(
      { status: 400, body: { error: 'Price must be above 0.20' } },
      { status: 503, body: 'not json' },
    );

    await expect(client.get('/a')).rejects.toThrow('Etsy returned 400: Price must be above 0.20');
    await expect(client.get('/b')).rejects.toMatchObject({ status: 503 });
  });

  it('does not wait out a daily limit', async () => {
    const { client, calls } = clientWith({
      status: 429,
      body: { error: 'daily limit' },
      headers: { 'Retry-After': '7200' },
    });

    await expect(client.get('/a')).rejects.toMatchObject({ status: 429 });
    expect(calls()).toHaveLength(1);
  });

  it('gives up after too many rate limits', async () => {
    const limited = { status: 429, body: { error: 'slow down' } };
    const { client } = clientWith(limited, limited, limited, limited);

    await expect(client.get('/a')).rejects.toMatchObject({ status: 429 });
  });
});
