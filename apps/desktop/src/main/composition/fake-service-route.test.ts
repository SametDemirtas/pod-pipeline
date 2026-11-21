import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_DIRECTORY_VARIABLE } from '@pod/contracts';
import { FAKE_SERVICES_VARIABLE, fakeServiceRoute } from './fake-service-route.js';

const env = {
  [FAKE_SERVICES_VARIABLE]: 'http://127.0.0.1:4555',
  [DATA_DIRECTORY_VARIABLE]: '/tmp/pod-e2e',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fakeServiceRoute', () => {
  it('is never taken by a packaged app, nor without the variable', () => {
    expect(fakeServiceRoute(env, true)).toBeUndefined();
    expect(fakeServiceRoute({}, false)).toBeUndefined();
  });

  it('refuses to run without a data folder of its own, so the real profile keeps no plain secrets', () => {
    expect(() =>
      fakeServiceRoute({ [FAKE_SERVICES_VARIABLE]: 'http://127.0.0.1:4555' }, false),
    ).toThrow(DATA_DIRECTORY_VARIABLE);
  });

  it('refuses an address other than a loopback http one', () => {
    for (const address of ['https://127.0.0.1:4555', 'http://example.com', 'http://0.0.0.0:1']) {
      expect(() => fakeServiceRoute({ ...env, [FAKE_SERVICES_VARIABLE]: address }, false)).toThrow(
        FAKE_SERVICES_VARIABLE,
      );
    }
  });

  it('sends https requests to the fake with their host first, and others as they are', async () => {
    const sent: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        sent.push(request);
        return Promise.resolve(new Response('ok'));
      }),
    );
    const route = fakeServiceRoute(env, false);

    await route?.fetch('https://api.printful.com/stores?limit=1', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: '{}',
    });
    await route?.fetch('http://127.0.0.1:3003/callback?code=c');
    await route?.openExternal('https://www.etsy.com/oauth/connect?state=s');

    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST http://127.0.0.1:4555/api.printful.com/stores?limit=1',
      'GET http://127.0.0.1:3003/callback?code=c',
      'GET http://127.0.0.1:4555/www.etsy.com/oauth/connect?state=s',
    ]);
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer t');
    expect(await sent[0]?.text()).toBe('{}');
  });

  it('keeps secrets readable without a keychain', () => {
    const encryption = fakeServiceRoute(env, false)?.encryption;

    expect(encryption?.isEncryptionAvailable()).toBe(true);
    expect(encryption?.decryptString(encryption.encryptString('token'))).toBe('token');
  });
});
