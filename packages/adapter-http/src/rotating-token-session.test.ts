import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '@pod/core';
import { RotatingTokenSession, type RefreshedToken } from './rotating-token-session.js';

interface Credentials {
  readonly refreshToken: string;
}

class MovableClock implements Clock {
  time = Date.parse('2026-10-26T10:00:00.000Z');
  now(): Date {
    return new Date(this.time);
  }
}

function sessionWith(
  tokens: RefreshedToken[],
  start: Credentials | null = { refreshToken: 'r1' },
  onTokenNotSaved?: (error: unknown) => void,
) {
  let stored = start ?? undefined;
  const clock = new MovableClock();
  const refresh = vi.fn((_credentials: Credentials, refreshToken: string) => {
    const token = tokens.shift();
    return token
      ? Promise.resolve(token)
      : Promise.reject(new Error(`no token for ${refreshToken}`));
  });
  let failSaves = 0;
  const session = new RotatingTokenSession<Credentials>({
    credentials: () => Promise.resolve(stored),
    refresh,
    saveRefreshToken: (_previous, next) => {
      if (failSaves-- > 0) return Promise.reject(new Error('disk full'));
      stored = { refreshToken: next };
      return Promise.resolve();
    },
    onTokenNotSaved,
    clock,
    notConnected: () => new Error('not connected'),
  });
  return {
    session,
    clock,
    refresh,
    stored: () => stored,
    failNextSaves: (count: number) => (failSaves = count),
    signIn: (next: Credentials) => (stored = next),
  };
}

const token = (accessToken: string, refreshToken: string | null = null): RefreshedToken => ({
  accessToken,
  refreshToken,
  expiresInSeconds: 3600,
});

describe('RotatingTokenSession', () => {
  it('refreshes once for callers at the same time and reuses the token until it expires', async () => {
    const { session, clock, refresh } = sessionWith([token('a', 'r2'), token('b')]);

    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual(['a', 'a']);
    expect(await session.accessToken()).toBe('a');
    clock.time += 3540_000;
    expect(await session.accessToken()).toBe('b');
    expect(refresh.mock.calls.map(([, refreshToken]) => refreshToken)).toEqual(['r1', 'r2']);
  });

  it('tries a second time to store a rotated token', async () => {
    const notSaved = vi.fn();
    const { session, stored, failNextSaves } = sessionWith([token('a', 'r2')], undefined, notSaved);
    failNextSaves(1);

    expect(await session.accessToken()).toBe('a');
    expect(stored()?.refreshToken).toBe('r2');
    expect(notSaved).not.toHaveBeenCalled();
  });

  it('reports a rotated token it could not store, keeps it and stores it on the next call', async () => {
    const notSaved = vi.fn();
    const { session, stored, failNextSaves, refresh } = sessionWith(
      [token('a', 'r2')],
      undefined,
      notSaved,
    );
    failNextSaves(2);

    expect(await session.accessToken()).toBe('a');
    expect(stored()?.refreshToken).toBe('r1');
    expect(notSaved).toHaveBeenCalledExactlyOnceWith(new Error('disk full'));
    expect(await session.accessToken()).toBe('a');
    expect(stored()?.refreshToken).toBe('r2');
    session.invalidate();
    await session.accessToken().catch(() => undefined);
    expect(refresh.mock.calls.at(-1)?.[1]).toBe('r2');
  });

  it('starts over after a new sign-in or a rejected token', async () => {
    const { session, signIn, refresh } = sessionWith([token('a'), token('b'), token('c')]);
    await session.accessToken();

    signIn({ refreshToken: 'other' });
    expect(await session.accessToken()).toBe('b');
    session.invalidate();
    expect(await session.accessToken()).toBe('c');
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('hands out the access token though the listener for an unsaved token fails', async () => {
    const { session, failNextSaves } = sessionWith([token('a', 'r2')], undefined, () => {
      throw new Error('window gone');
    });
    failNextSaves(2);

    expect(await session.accessToken()).toBe('a');
  });

  it('uses a short-lived token for half its lifetime instead of refreshing on every call', async () => {
    const { session, clock, refresh } = sessionWith([
      { accessToken: 'a', refreshToken: null, expiresInSeconds: 60 },
      token('b'),
    ]);

    expect(await session.accessToken()).toBe('a');
    clock.time += 29_000;
    expect(await session.accessToken()).toBe('a');
    clock.time += 1_000;
    expect(await session.accessToken()).toBe('b');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('says when nobody signed in', async () => {
    const { session } = sessionWith([], null);

    await expect(session.accessToken()).rejects.toThrow('not connected');
    await expect(session.credentials()).rejects.toThrow('not connected');
  });
});
