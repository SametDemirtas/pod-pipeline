import { describe, expect, it } from 'vitest';
import { json } from '../testing/fake-services/http.js';
import { fixedClock as clock, oneId as ids, prefixFetch } from '../testing/route-fetch.js';
import { createConnectionChecks } from './connection-checks.js';

const s3 = {
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'pod',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

describe('connection checks', () => {
  it('sign in on Etsy and Pinterest in the browser, and stop when cancelled', async () => {
    const checks = createConnectionChecks(fetch, clock, ids);
    const cancelled = AbortSignal.abort();
    const open = () => Promise.resolve();

    await expect(
      checks.signIns.etsy({ keystring: 'k', sharedSecret: 's' }, open, cancelled),
    ).rejects.toBe(cancelled.reason);
    await expect(
      checks.signIns.pinterest({ appId: '1', appSecret: 's' }, open, cancelled),
    ).rejects.toBe(cancelled.reason);
  });

  it('reads the store with the token being checked, and what it syncs with', async () => {
    const { fetch, calls } = prefixFetch({
      'GET https://api.printful.com/stores': () =>
        json({
          code: 200,
          result: [{ name: 'Example', type: 'etsy', website: 'https://www.etsy.com/shop/Example' }],
        }),
    });

    expect(await createConnectionChecks(fetch, clock, ids).printful('tok')).toEqual({
      name: 'Example',
      syncsWithMarketplace: true,
      shopHandle: 'Example',
    });
    expect(calls).toEqual([{ method: 'GET', url: 'https://api.printful.com/stores' }]);
  });

  it('names the store Printful when the answer has no name', async () => {
    const { fetch } = prefixFetch({
      'GET https://api.printful.com/stores': () => json({ code: 200, result: [{ id: 1 }] }),
    });

    expect(await createConnectionChecks(fetch, clock, ids).printful('tok')).toEqual({
      name: 'Printful',
      syncsWithMarketplace: null,
      shopHandle: null,
    });
  });

  it.each([
    [[], 0],
    [[{ name: 'One' }, { name: 'Two' }], 2],
  ])('refuses a token that does not reach exactly one store', async (stores, count) => {
    const { fetch } = prefixFetch({
      'GET https://api.printful.com/stores': () => json({ code: 200, result: stores }),
    });

    await expect(createConnectionChecks(fetch, clock, ids).printful('tok')).rejects.toMatchObject({
      code: 'PRINTFUL_TOKEN_NOT_SINGLE_STORE',
      details: { storeCount: count },
    });
  });

  it('rejects a refused token with the message from Printful', async () => {
    const { fetch } = prefixFetch({
      'GET https://api.printful.com/stores': () =>
        json({ code: 401, error: { message: 'bad token' } }, 401),
    });

    await expect(createConnectionChecks(fetch, clock, ids).printful('x')).rejects.toThrow(
      'Printful returned 401: bad token',
    );
  });

  it('uploads and removes a test file to check the bucket', async () => {
    const { fetch, calls } = prefixFetch({
      'PUT https://acc.r2.cloudflarestorage.com/pod/': () => new Response('', { status: 200 }),
      'DELETE https://acc.r2.cloudflarestorage.com/pod/': () => new Response(null, { status: 204 }),
    });

    await createConnectionChecks(fetch, clock, ids).s3(s3);

    expect(calls.map((call) => call.method)).toEqual(['PUT', 'DELETE']);
    expect(calls[0]?.url).toMatch(/\/pod\/pod-pipeline\/.+\/connection-test\.png$/);
  });

  it('exchanges the Dropbox code for a refresh token', async () => {
    const { fetch } = prefixFetch({
      'POST https://api.dropboxapi.com/oauth2/token': () =>
        json({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 14400,
        }),
    });
    const checks = createConnectionChecks(fetch, clock, ids);
    const { verifier, challenge } = checks.dropbox.createPkcePair();

    expect(checks.dropbox.authorizeUrl('key', challenge)).toContain('client_id=key');
    expect(await checks.dropbox.refreshToken('key', 'code', verifier)).toBe('r');
  });
});
