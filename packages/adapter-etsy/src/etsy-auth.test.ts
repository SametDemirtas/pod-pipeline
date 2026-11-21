import { describe, expect, it } from 'vitest';
import {
  etsyAuthorizeUrl,
  exchangeEtsyCode,
  ETSY_REDIRECT_URI,
  ETSY_TOKEN_URL,
} from './etsy-auth.js';
import { FakeFetch } from '@pod/adapter-http/testing';
import { TOKEN_REPLY } from './testing/fake-fetch.js';

describe('Etsy sign-in', () => {
  it('asks for listing and shop access with PKCE and a state', () => {
    const url = new URL(etsyAuthorizeUrl({ keystring: 'key', codeChallenge: 'chal', state: 'st' }));

    expect(url.origin + url.pathname).toBe('https://www.etsy.com/oauth/connect');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'key',
      redirect_uri: 'http://localhost:3003/oauth/redirect',
      scope: 'listings_r listings_w listings_d shops_r',
      state: 'st',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
    });
  });

  it('trades the code for tokens', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY);

    const token = await exchangeEtsyCode(
      { keystring: 'key', code: 'c0de', codeVerifier: 'verifier' },
      fake.fetch,
    );

    expect(token).toEqual({
      accessToken: '1001001.access',
      refreshToken: 'refresh-2',
      expiresInSeconds: 3600,
    });
    expect(fake.requests[0]).toMatchObject({
      url: ETSY_TOKEN_URL,
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        client_id: 'key',
        redirect_uri: ETSY_REDIRECT_URI,
        code: 'c0de',
        code_verifier: 'verifier',
      },
    });
  });

  it('reports why Etsy refused', async () => {
    const fake = new FakeFetch().reply({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'code expired' },
    });

    await expect(
      exchangeEtsyCode({ keystring: 'k', code: 'c', codeVerifier: 'v' }, fake.fetch),
    ).rejects.toMatchObject({ message: 'Etsy returned 400: code expired', code: 'invalid_grant' });
  });

  it('rejects an answer without tokens', async () => {
    const fake = new FakeFetch().reply(
      { body: { access_token: 'a' } },
      { status: 500, body: 'oops' },
    );

    await expect(
      exchangeEtsyCode({ keystring: 'k', code: 'c', codeVerifier: 'v' }, fake.fetch),
    ).rejects.toThrow(/without a refresh token/);
    await expect(
      exchangeEtsyCode({ keystring: 'k', code: 'c', codeVerifier: 'v' }, fake.fetch),
    ).rejects.toThrow('Etsy returned 500: sign-in failed');
  });
});
