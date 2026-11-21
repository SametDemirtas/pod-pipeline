import { describe, expect, it } from 'vitest';
import {
  DROPBOX_TOKEN_URL,
  dropboxAuthorizeUrl,
  exchangeDropboxCode,
  requestDropboxToken,
} from './dropbox-auth.js';
import { FileHostRequestError, FileHostUnexpectedResponseError } from './errors.js';
import { ResponderFetch, json, text } from './testing/responder-fetch.js';

describe('dropboxAuthorizeUrl', () => {
  it('asks for an offline code with an S256 challenge and no redirect', () => {
    const url = new URL(dropboxAuthorizeUrl('app-key', 'challenge'));

    expect(url.origin + url.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app-key',
      response_type: 'code',
      token_access_type: 'offline',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    });
  });
});

describe('exchangeDropboxCode', () => {
  it('trades the pasted code for a refresh token', async () => {
    const fake = new ResponderFetch().reply(
      json({ access_token: 'access', expires_in: 14400, refresh_token: 'refresh' }),
    );

    const refreshToken = await exchangeDropboxCode(
      { appKey: 'app-key', code: '  pasted-code \n', codeVerifier: 'verifier' },
      fake.fetch,
    );

    expect(refreshToken).toBe('refresh');
    const [request] = fake.requests;
    expect(request?.url).toBe(DROPBOX_TOKEN_URL);
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(await request?.text()))).toEqual({
      grant_type: 'authorization_code',
      code: 'pasted-code',
      client_id: 'app-key',
      code_verifier: 'verifier',
    });
  });

  it('fails when Dropbox rejects the code or returns no refresh token', async () => {
    const fake = new ResponderFetch().reply(
      json({ error: 'invalid_grant', error_description: 'code does not exist' }, 400),
      json({ access_token: 'access', expires_in: 14400 }),
      text('not json', 500),
    );
    const exchange = { appKey: 'k', code: 'c', codeVerifier: 'v' };

    await expect(exchangeDropboxCode(exchange, fake.fetch)).rejects.toMatchObject({
      status: 400,
      reason: 'invalid_grant',
    });
    await expect(exchangeDropboxCode(exchange, fake.fetch)).rejects.toThrow(
      new FileHostUnexpectedResponseError('dropbox', 'token response without a refresh token'),
    );
    await expect(exchangeDropboxCode(exchange, fake.fetch)).rejects.toBeInstanceOf(
      FileHostRequestError,
    );
  });
});

describe('requestDropboxToken', () => {
  it('takes a token without a lifetime to last the four hours Dropbox gives', async () => {
    const fake = new ResponderFetch().reply(json({ access_token: 'access' }));

    const token = await requestDropboxToken(fake.fetch, { grant_type: 'refresh_token' });

    expect(token.expiresInSeconds).toBe(14_400);
  });
});
