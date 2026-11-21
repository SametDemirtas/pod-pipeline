import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ETSY_REDIRECT_URI } from '@pod/adapter-etsy';
import { ETSY_CALLBACK_URL } from '@pod/contracts';
import { signInToEtsy } from './etsy-sign-in.js';

/** A port nothing listens on, so the tests never meet a real sign-in on 3003. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, 'localhost', () => {
      const address = probe.address();
      probe.close(() => {
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
  });
}

describe('signInToEtsy', () => {
  it('tells the seller the same callback address the adapter uses', () => {
    expect(ETSY_CALLBACK_URL).toBe(ETSY_REDIRECT_URI);
  });

  it('opens Etsy, trades the code and finds the shop without refreshing the token', async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      const body = url.includes('/oauth/token')
        ? { access_token: '1.access', refresh_token: 'refresh-1', expires_in: 3600 }
        : url.endsWith('/users/me')
          ? { user_id: 1, shop_id: 10001001 }
          : { shop_name: 'ExampleShop' };
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const port = await freePort();
    const access = await signInToEtsy(
      { keystring: 'key', sharedSecret: 'secret' },
      async (url) => {
        const authorize = new URL(url);
        const state = authorize.searchParams.get('state') ?? '';
        expect(authorize.searchParams.get('client_id')).toBe('key');
        await fetch(`http://localhost:${port}/oauth/redirect?code=c0de&state=${state}`);
      },
      { fetch: fakeFetch, port },
    );

    expect(access).toEqual({
      refreshToken: 'refresh-1',
      shopId: '10001001',
      shopName: 'ExampleShop',
    });
    expect(calls).toEqual([
      'POST https://api.etsy.com/v3/public/oauth/token',
      'GET https://openapi.etsy.com/v3/application/users/me',
      'GET https://openapi.etsy.com/v3/application/shops/10001001',
    ]);
  });

  it('refuses an account without a shop', async () => {
    const fakeFetch: typeof fetch = (input) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            (input instanceof Request ? input.url : input.toString()).includes('/oauth/token')
              ? { access_token: 'a', refresh_token: 'r', expires_in: 1 }
              : { user_id: 1, shop_id: null },
          ),
        ),
      );

    const port = await freePort();
    await expect(
      signInToEtsy(
        { keystring: 'key', sharedSecret: 'secret' },
        async (url) => {
          const state = new URL(url).searchParams.get('state') ?? '';
          await fetch(`http://localhost:${port}/oauth/redirect?code=c&state=${state}`);
        },
        { fetch: fakeFetch, port },
      ),
    ).rejects.toThrow('this Etsy account has no shop');
  });

  it('names the shop Etsy when the shop has no name', async () => {
    const fakeFetch: typeof fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = url.includes('/oauth/token')
        ? { access_token: 'a', refresh_token: 'r', expires_in: 1 }
        : url.endsWith('/users/me')
          ? { shop_id: 5 }
          : {};
      return Promise.resolve(new Response(JSON.stringify(body)));
    };

    const port = await freePort();
    const access = await signInToEtsy(
      { keystring: 'key', sharedSecret: 'secret' },
      async (url) => {
        const state = new URL(url).searchParams.get('state') ?? '';
        await fetch(`http://localhost:${port}/oauth/redirect?code=c&state=${state}`);
      },
      { fetch: fakeFetch, port },
    );

    expect(access.shopName).toBe('Etsy');
  });

  it.each([
    ['trading the code', '/oauth/token'],
    ['finding the shop', '/users/me'],
  ])('stops %s when the seller cancels meanwhile', async (_step, cancelledPath) => {
    const cancel = new AbortController();
    const fakeFetch: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.includes(cancelledPath)) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1 })),
        );
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        cancel.abort();
      });
    };

    const port = await freePort();
    await expect(
      signInToEtsy(
        { keystring: 'key', sharedSecret: 'secret' },
        async (url) => {
          const state = new URL(url).searchParams.get('state') ?? '';
          await fetch(`http://localhost:${port}/oauth/redirect?code=c&state=${state}`);
        },
        { fetch: fakeFetch, port, signal: cancel.signal },
      ),
    ).rejects.toThrow('aborted');
  });
});
