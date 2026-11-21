import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { PINTEREST_REDIRECT_URI } from '@pod/adapter-pinterest';
import { PINTEREST_CALLBACK_URL } from '@pod/contracts';
import { signInToPinterest } from './pinterest-sign-in.js';

/** A port nothing listens on, so the tests never meet a real sign-in on 3004. */
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

function fakeFetch(token: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const body = url.includes('/oauth/token') ? token : { username: 'example-pins' };
    return Promise.resolve(new Response(JSON.stringify(body)));
  };
  return { calls, fetchFn };
}

async function signIn(fetchFn: typeof fetch) {
  const port = await freePort();
  return signInToPinterest(
    { appId: '1500', appSecret: 'secret' },
    async (url) => {
      const authorize = new URL(url);
      expect(authorize.searchParams.get('client_id')).toBe('1500');
      const state = authorize.searchParams.get('state') ?? '';
      await fetch(`http://localhost:${port}/oauth/redirect?code=c0de&state=${state}`);
    },
    { fetch: fetchFn, port },
  );
}

describe('signInToPinterest', () => {
  it('tells the seller the same callback address the adapter uses', () => {
    expect(PINTEREST_CALLBACK_URL).toBe(PINTEREST_REDIRECT_URI);
  });

  it('opens Pinterest, trades the code and reads the account name', async () => {
    const { calls, fetchFn } = fakeFetch({ access_token: 'a', refresh_token: 'r', expires_in: 1 });

    expect(await signIn(fetchFn)).toEqual({ refreshToken: 'r', username: 'example-pins' });
    expect(calls).toEqual([
      'POST https://api.pinterest.com/v5/oauth/token',
      'GET https://api.pinterest.com/v5/user_account',
    ]);
  });

  it('stops when the seller cancels before allowing access', async () => {
    const cancel = new AbortController();
    cancel.abort();
    const port = await freePort();

    await expect(
      signInToPinterest({ appId: '1500', appSecret: 'secret' }, () => Promise.resolve(), {
        fetch: () => Promise.reject(new Error('no request expected')),
        port,
        signal: cancel.signal,
      }),
    ).rejects.toBe(cancel.signal.reason);
  });

  it('refuses a sign-in without a refresh token, which could not last', async () => {
    const { fetchFn } = fakeFetch({ access_token: 'a' });

    await expect(signIn(fetchFn)).rejects.toThrow('did not hand out a refresh token');
  });

  it('stops trading the code when the seller cancels meanwhile', async () => {
    const cancel = new AbortController();
    const port = await freePort();
    const fetchFn: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        cancel.abort();
      });

    await expect(
      signInToPinterest(
        { appId: '1500', appSecret: 'secret' },
        async (url) => {
          const state = new URL(url).searchParams.get('state') ?? '';
          await fetch(`http://localhost:${String(port)}/oauth/redirect?code=c&state=${state}`);
        },
        { fetch: fetchFn, port, signal: cancel.signal },
      ),
    ).rejects.toThrow('aborted');
  });

  it('stops reading the account name when the seller cancels meanwhile', async () => {
    const cancel = new AbortController();
    const port = await freePort();
    const fetchFn: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes('/oauth/token')) {
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

    await expect(
      signInToPinterest(
        { appId: '1500', appSecret: 'secret' },
        async (url) => {
          const state = new URL(url).searchParams.get('state') ?? '';
          await fetch(`http://localhost:${String(port)}/oauth/redirect?code=c&state=${state}`);
        },
        { fetch: fetchFn, port, signal: cancel.signal },
      ),
    ).rejects.toThrow('aborted');
  });
});
