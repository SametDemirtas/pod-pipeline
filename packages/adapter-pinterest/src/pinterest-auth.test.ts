import { describe, expect, it } from 'vitest';
import {
  exchangePinterestCode,
  PINTEREST_REDIRECT_URI,
  pinterestAuthorizeUrl,
} from './pinterest-auth.js';
import { FakeFetch } from '@pod/adapter-http/testing';

const app = { appId: '1500', appSecret: 'secret' };

describe('Pinterest sign-in', () => {
  it('asks for boards, pins and the account name, back to the local address', () => {
    const url = new URL(pinterestAuthorizeUrl('1500', 'state-1'));

    expect(url.origin + url.pathname).toBe('https://www.pinterest.com/oauth/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '1500',
      redirect_uri: 'http://localhost:3004/oauth/redirect',
      response_type: 'code',
      scope: 'boards:read,pins:write,user_accounts:read',
      state: 'state-1',
    });
  });

  it('exchanges the code with the app id and secret', async () => {
    const fake = new FakeFetch().reply({
      body: { access_token: 'a', refresh_token: 'r', expires_in: 2_592_000 },
    });

    const token = await exchangePinterestCode(app, 'code-1', fake.fetch);

    expect(token).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 2_592_000 });
    expect(fake.requests[0]).toMatchObject({
      url: 'https://api.pinterest.com/v5/oauth/token',
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from('1500:secret').toString('base64')}` },
      body: {
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: PINTEREST_REDIRECT_URI,
      },
    });
  });

  it('keeps the refresh token when none comes back, and assumes a day without an expiry', async () => {
    const fake = new FakeFetch().reply({ body: { access_token: 'a' } });

    expect(await exchangePinterestCode(app, 'c', fake.fetch)).toEqual({
      accessToken: 'a',
      refreshToken: null,
      expiresInSeconds: 86_400,
    });
  });

  it.each([
    [
      { status: 400, body: { error: 'invalid_grant', error_description: 'Code expired' } },
      /Code expired/,
    ],
    [
      { status: 401, body: { code: 2, message: 'Authentication failed.' } },
      /Authentication failed/,
    ],
    [{ status: 500, body: 'oops' }, /sign-in failed/],
    [{ body: { token_type: 'bearer' } }, /without an access token/],
  ])('reports a refused exchange: %o', async (reply, message) => {
    const fake = new FakeFetch().reply(reply);

    await expect(exchangePinterestCode(app, 'c', fake.fetch)).rejects.toThrow(message);
  });
});
