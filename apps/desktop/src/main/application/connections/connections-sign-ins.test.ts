import { beforeEach, describe, expect, it } from 'vitest';
import { ConnectionSecrets } from './connection-secrets.js';
import {
  checks,
  connections,
  file,
  openExternal,
  setUpConnections,
  unsaved,
} from '../../testing/connections-setup.js';

beforeEach(setUpConnections);

describe('ConnectionsService sign-ins in the browser', () => {
  it('signs in on Etsy in the browser and keeps only the shop name visible', async () => {
    const result = await connections.connectSignIn({
      service: 'etsy',
      keystring: 'key',
      sharedSecret: 'secret',
    });

    expect(checks.signIns.etsy).toHaveBeenCalledWith(
      { keystring: 'key', sharedSecret: 'secret' },
      openExternal,
      expect.any(AbortSignal),
    );
    expect(result.etsy).toEqual({ shopName: 'Example' });
    expect(JSON.stringify(result)).not.toMatch(/secret|refresh/);
    expect(await new ConnectionSecrets(file).signIns.etsy.get()).toEqual({
      keystring: 'key',
      sharedSecret: 'secret',
      refreshToken: 'etsy-refresh',
      shopId: '10001001',
      shopName: 'Example',
    });

    expect((await connections.disconnect({ service: 'etsy' })).etsy).toBeNull();
  });

  it('asks to connect Etsy again when its renewed sign-in was not saved, until it is', async () => {
    unsaved.failed('etsy', new Error('disk full'), () => undefined);
    expect((await connections.get()).reconnect).toEqual(['etsy']);

    await connections.connectSignIn({ service: 'etsy', keystring: 'key', sharedSecret: 'secret' });

    expect((await connections.get()).reconnect).toBeUndefined();
  });

  it('cancels a waiting Etsy sign-in and frees the other connection changes', async () => {
    checks.signIns.etsy.mockImplementationOnce(
      (_app, _open, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('the sign-in was cancelled'));
          });
        }),
    );
    const signIn = connections.connectSignIn({
      service: 'etsy',
      keystring: 'key',
      sharedSecret: 'secret',
    });

    await connections.cancelSignIn({ service: 'etsy' });

    await expect(signIn).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    expect((await connections.connectPrintful({ token: 'pf' })).printful).not.toBeNull();
    expect((await connections.cancelSignIn({ service: 'etsy' })).etsy).toBeNull();
  });

  it('cancels a waiting sign-in when the app closes, and takes no new change', async () => {
    checks.signIns.etsy.mockImplementationOnce(
      (_app, _open, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('the sign-in was cancelled'));
          });
        }),
    );
    const signIn = connections.connectSignIn({
      service: 'etsy',
      keystring: 'key',
      sharedSecret: 'secret',
    });

    await connections.close();

    await expect(signIn).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    await expect(connections.connectPrintful({ token: 'pf' })).rejects.toMatchObject({
      code: 'APP_CLOSING',
    });
  });

  it.each(['etsy', 'pinterest'] as const)(
    'says a %s sign-in cancelled after the browser step was cancelled',
    async (service) => {
      const aborted = (_app: unknown, _open: unknown, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
          });
        });
      checks.signIns.etsy.mockImplementationOnce(aborted);
      checks.signIns.pinterest.mockImplementationOnce(aborted);
      const signIn = connections.connectSignIn(
        service === 'etsy'
          ? { service, keystring: 'key', sharedSecret: 'secret' }
          : { service, appId: '1500', appSecret: 'secret' },
      );

      await connections.cancelSignIn({ service });

      await expect(signIn).rejects.toMatchObject({
        code: 'CONNECTION_FAILED',
        details: { service, reason: 'the sign-in was cancelled' },
      });
    },
  );

  it('stores nothing when the Etsy sign-in fails', async () => {
    checks.signIns.etsy.mockRejectedValueOnce(new Error('nobody allowed access on Etsy in time'));

    await expect(
      connections.connectSignIn({ service: 'etsy', keystring: 'key', sharedSecret: 'secret' }),
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', details: { service: 'etsy' } });
    expect((await connections.get()).etsy).toBeNull();
  });

  it('keeps the newest Etsy refresh token and ignores one without a sign-in', async () => {
    const secrets = new ConnectionSecrets(file);
    await secrets.signIns.etsy.rotateRefreshToken('etsy-refresh', 'orphan');
    expect(await secrets.signIns.etsy.get()).toBeUndefined();

    await connections.connectSignIn({ service: 'etsy', keystring: 'key', sharedSecret: 'secret' });
    await secrets.signIns.etsy.rotateRefreshToken('from-an-older-sign-in', 'stale');
    expect((await secrets.signIns.etsy.get())?.refreshToken).toBe('etsy-refresh');
    await secrets.signIns.etsy.rotateRefreshToken('etsy-refresh', 'etsy-refresh-2');

    expect((await secrets.signIns.etsy.get())?.refreshToken).toBe('etsy-refresh-2');
  });

  it('signs in on Pinterest, shows only the account name, and rotates its token', async () => {
    const result = await connections.connectSignIn({
      service: 'pinterest',
      appId: '1500',
      appSecret: 'secret',
    });
    const secrets = new ConnectionSecrets(file);

    expect(checks.signIns.pinterest).toHaveBeenCalledWith(
      { appId: '1500', appSecret: 'secret' },
      openExternal,
      expect.any(AbortSignal),
    );
    expect(result.pinterest).toEqual({ username: 'example-pins' });
    expect(JSON.stringify(result)).not.toMatch(/secret|refresh/);
    await secrets.signIns.pinterest.rotateRefreshToken('older', 'stale');
    expect((await secrets.signIns.pinterest.get())?.refreshToken).toBe('pin-refresh');
    await secrets.signIns.pinterest.rotateRefreshToken('pin-refresh', 'pin-refresh-2');
    expect(await secrets.signIns.pinterest.get()).toEqual({
      appId: '1500',
      appSecret: 'secret',
      refreshToken: 'pin-refresh-2',
      username: 'example-pins',
    });

    expect((await connections.disconnect({ service: 'pinterest' })).pinterest).toBeNull();
    await secrets.signIns.pinterest.rotateRefreshToken('pin-refresh-2', 'orphan');
    expect(await secrets.signIns.pinterest.get()).toBeUndefined();
  });

  it('cancels a waiting Pinterest sign-in and stores nothing', async () => {
    checks.signIns.pinterest.mockImplementationOnce(
      (_app, _open, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('the sign-in was cancelled'));
          });
        }),
    );
    const signIn = connections.connectSignIn({
      service: 'pinterest',
      appId: '1500',
      appSecret: 'secret',
    });

    await connections.cancelSignIn({ service: 'pinterest' });

    await expect(signIn).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      details: { service: 'pinterest' },
    });
    expect((await connections.cancelSignIn({ service: 'pinterest' })).pinterest).toBeNull();
  });
});
