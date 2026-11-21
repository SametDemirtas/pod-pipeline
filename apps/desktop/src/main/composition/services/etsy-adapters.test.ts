import { describe, expect, it, vi } from 'vitest';
import { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { MemorySecrets } from '../../testing/memory-secrets.js';
import { createEtsyProviders } from './etsy-adapters.js';

describe('createEtsyProviders', () => {
  it('stores the refresh token Etsy hands out while reading the shop', async () => {
    const secrets = new ConnectionSecrets(new MemorySecrets());
    await secrets.signIns.etsy.save({
      keystring: 'key',
      sharedSecret: 'secret',
      refreshToken: 'refresh-1',
      shopId: '10001001',
      shopName: 'Example',
    });
    const fakeFetch: typeof fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = url.includes('/oauth/token')
        ? { access_token: 'a', refresh_token: 'refresh-2', expires_in: 3600 }
        : url.endsWith('/shops/10001001')
          ? { shop_name: 'Example', currency_code: 'USD' }
          : { results: [] };
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const onTokenNotSaved = vi.fn();
    const { shop } = createEtsyProviders({
      secrets,
      fetch: fakeFetch,
      clock: { now: () => new Date() },
      onTokenNotSaved,
    });

    expect((await shop.options()).currency).toBe('USD');
    expect((await secrets.signIns.etsy.get())?.refreshToken).toBe('refresh-2');
    expect(onTokenNotSaved).not.toHaveBeenCalled();
  });

  it('says so when the refresh token Etsy hands out cannot be stored', async () => {
    const secrets = new ConnectionSecrets(new MemorySecrets());
    await secrets.signIns.etsy.save({
      keystring: 'key',
      sharedSecret: 'secret',
      refreshToken: 'refresh-1',
      shopId: '10001001',
      shopName: 'Example',
    });
    vi.spyOn(secrets.signIns.etsy, 'rotateRefreshToken').mockRejectedValue(new Error('disk full'));
    const fakeFetch: typeof fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = url.includes('/oauth/token')
        ? { access_token: 'a', refresh_token: 'refresh-2', expires_in: 3600 }
        : { shop_name: 'Example', currency_code: 'USD' };
      return Promise.resolve(new Response(JSON.stringify(body)));
    };
    const onTokenNotSaved = vi.fn();
    const { shop } = createEtsyProviders({
      secrets,
      fetch: fakeFetch,
      clock: { now: () => new Date() },
      onTokenNotSaved,
    });

    await shop.options().catch(() => undefined);

    expect(onTokenNotSaved).toHaveBeenCalledWith(new Error('disk full'));
  });
});
