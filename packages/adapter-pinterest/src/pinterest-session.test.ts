import { describe, expect, it } from 'vitest';
import type { Clock } from '@pod/core';
import { FakeFetch } from '@pod/adapter-http/testing';
import { PinterestSession, type PinterestCredentials } from './pinterest-session.js';
import { CREDENTIALS, TOKEN_REPLY } from './testing/fake-fetch.js';

class MovableClock implements Clock {
  time = Date.parse('2026-10-26T10:00:00.000Z');
  now(): Date {
    return new Date(this.time);
  }
}

function sessionWith(fake: FakeFetch, start: PinterestCredentials | null = CREDENTIALS) {
  let stored = start ?? undefined;
  const saved: string[] = [];
  const clock = new MovableClock();
  const session = new PinterestSession({
    credentials: () => Promise.resolve(stored),
    saveRefreshToken: (_previous, refreshToken) => {
      saved.push(refreshToken);
      if (stored) stored = { ...stored, refreshToken };
      return Promise.resolve();
    },
    fetch: fake.fetch,
    clock,
  });
  return { session, clock, saved };
}

describe('PinterestSession', () => {
  it('refreshes once, stores a new refresh token and reuses the access token', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY);
    const { session, saved } = sessionWith(fake);

    const tokens = await Promise.all([session.accessToken(), session.accessToken()]);
    const later = await session.accessToken();

    expect([...tokens, later]).toEqual(Array(3).fill('pina_access'));
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    });
    expect(saved).toEqual(['refresh-2']);
  });

  it('keeps the refresh token Pinterest did not replace, and refreshes before expiry', async () => {
    const fake = new FakeFetch().reply(
      { body: { access_token: 'first', expires_in: 3600 } },
      { body: { access_token: 'second', expires_in: 3600 } },
    );
    const { session, clock, saved } = sessionWith(fake);
    await session.accessToken();
    clock.time += 3540_000;

    expect(await session.accessToken()).toBe('second');
    expect(saved).toEqual([]);
  });

  it('asks again after a rejected token', async () => {
    const fake = new FakeFetch().reply(TOKEN_REPLY, {
      body: { access_token: 'again', refresh_token: 'refresh-3' },
    });
    const { session } = sessionWith(fake);
    await session.accessToken();

    session.invalidate();

    expect(await session.accessToken()).toBe('again');
  });

  it('says when nobody signed in', async () => {
    const { session } = sessionWith(new FakeFetch(), null);

    await expect(session.accessToken()).rejects.toThrow(/not connected/);
  });
});
