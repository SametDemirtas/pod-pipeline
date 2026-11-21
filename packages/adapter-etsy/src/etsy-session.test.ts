import { describe, expect, it } from 'vitest';
import type { Clock } from '@pod/core';
import { FakeFetch } from '@pod/adapter-http/testing';
import { EtsySession, type EtsyCredentials } from './etsy-session.js';
import { CREDENTIALS, TOKEN_REPLY } from './testing/fake-fetch.js';

class MovableClock implements Clock {
  time = Date.parse('2026-10-24T10:00:00.000Z');
  now(): Date {
    return new Date(this.time);
  }
}

function sessionWith(fake: FakeFetch, start: EtsyCredentials | null = CREDENTIALS) {
  let stored = start ?? undefined;
  const clock = new MovableClock();
  const session = new EtsySession({
    credentials: () => Promise.resolve(stored),
    saveRefreshToken: (_previous, refreshToken) => {
      if (stored) stored = { ...stored, refreshToken };
      return Promise.resolve();
    },
    fetch: fake.fetch,
    clock,
  });
  return {
    session,
    clock,
    stored: () => stored,
    signIn: (next: EtsyCredentials) => (stored = next),
  };
}

describe('EtsySession', () => {
  it('refreshes once, stores the new refresh token and reuses the access token', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY);
    const { session, stored } = sessionWith(fake);

    const tokens = await Promise.all([session.accessToken(), session.accessToken()]);
    const later = await session.accessToken();

    expect([...tokens, later]).toEqual(Array(3).fill('1001001.access'));
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.body).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    });
    expect(stored()?.refreshToken).toBe('refresh-2');
  });

  it('refreshes with the latest refresh token a minute before expiry', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY, {
      body: { access_token: 'second', refresh_token: 'refresh-3', expires_in: 3600 },
    });
    const { session, clock } = sessionWith(fake);
    await session.accessToken();

    clock.time += 3540_000;

    expect(await session.accessToken()).toBe('second');
    expect(fake.requests[1]?.body).toMatchObject({ refresh_token: 'refresh-2' });
  });

  it('refreshes after a new sign-in or when told the token was rejected', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY, TOKEN_REPLY, TOKEN_REPLY);
    const { session, signIn } = sessionWith(fake);
    await session.accessToken();

    signIn({ ...CREDENTIALS, refreshToken: 'other' });
    await session.accessToken();
    session.invalidate();
    await session.accessToken();

    expect(fake.requests).toHaveLength(3);
  });

  it('keeps using a new refresh token that could not be stored, and stores it later', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY, {
      body: { access_token: 'second', refresh_token: 'refresh-3', expires_in: 3600 },
    });
    let stored = CREDENTIALS;
    let failSave = true;
    const clock = new MovableClock();
    const session = new EtsySession({
      credentials: () => Promise.resolve(stored),
      saveRefreshToken: (_previous, refreshToken) => {
        if (failSave) return Promise.reject(new Error('keychain locked'));
        stored = { ...stored, refreshToken };
        return Promise.resolve();
      },
      fetch: fake.fetch,
      clock,
    });

    expect(await session.accessToken()).toBe('1001001.access');
    failSave = false;
    expect(await session.accessToken()).toBe('1001001.access');
    expect(stored.refreshToken).toBe('refresh-2');
    clock.time += 3600_000;
    expect(await session.accessToken()).toBe('second');
    expect(fake.requests[1]?.body).toMatchObject({ refresh_token: 'refresh-2' });
  });

  it('assumes an hour when Etsy does not say how long a token lasts', async () => {
    const fake = new FakeFetch().reply({ body: { access_token: 'a', refresh_token: 'r2' } });
    const { session } = sessionWith(fake);

    await session.accessToken();
    await session.accessToken();

    expect(fake.requests).toHaveLength(1);
  });

  it('says when nobody signed in', async () => {
    const { session } = sessionWith(new FakeFetch(), null);

    await expect(session.accessToken()).rejects.toThrow(/not connected/);
  });

  it('lets the next caller try again after a failed refresh', async () => {
    const fake = new FakeFetch().reply(
      { status: 400, body: { error: 'invalid_grant' } },
      TOKEN_REPLY,
    );
    const { session } = sessionWith(fake);

    await expect(session.accessToken()).rejects.toThrow('invalid_grant');
    expect(await session.accessToken()).toBe('1001001.access');
  });
});
