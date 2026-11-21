import { describe, expect, it } from 'vitest';
import { classifyServiceError, serviceErrors } from './service-errors.js';

const SHOP = serviceErrors('Shop', 'sign in first');
class ShopApiError extends SHOP.ApiError {}
class ShopUploadError extends Error {}
const rules = {
  revoked: ({ status }: { status: number }) => status === 401,
  alsoFailed: [ShopUploadError],
};

describe('serviceErrors', () => {
  it('names the service and the subclass', () => {
    const error = new ShopApiError(500, 'down', 'server_error');

    expect(error).toMatchObject({ name: 'ShopApiError', status: 500, code: 'server_error' });
    expect(error.message).toBe('Shop returned 500: down');
    expect(new SHOP.NotConnectedError().message).toBe('Shop is not connected; sign in first');
    expect(new SHOP.UnexpectedResponseError('no id').message).toBe(
      'Unexpected Shop response: no id',
    );
  });
});

describe('classifyServiceError', () => {
  it('reads a rate limit as busy, with the wait it asked for', () => {
    const classify = (error: unknown) => classifyServiceError(error, SHOP, rules);

    expect(classify(new ShopApiError(429, 'slow down', undefined, 30))).toEqual({
      kind: 'busy',
      service: 'Shop',
      retryAfterSeconds: 30,
    });
    expect(classify(new ShopApiError(429, 'slow down'))).toEqual({ kind: 'busy', service: 'Shop' });
    expect(classify(new ShopApiError(503, 'unavailable'))).toEqual({
      kind: 'busy',
      service: 'Shop',
    });
  });

  it('reads missing or revoked access as not connected and the rest as failed', () => {
    const classify = (error: unknown) => classifyServiceError(error, SHOP, rules);

    expect(classify(new SHOP.NotConnectedError())).toEqual({
      kind: 'not-connected',
      service: 'Shop',
    });
    expect(classify(new ShopApiError(401, 'no'))).toEqual({
      kind: 'not-connected',
      service: 'Shop',
    });
    expect(classify(new ShopApiError(500, 'down'))).toEqual({
      kind: 'failed',
      service: 'Shop',
      reason: 'Shop returned 500: down',
    });
    expect(classify(new SHOP.RequestError('too long'))).toMatchObject({ kind: 'failed' });
    expect(classify(new ShopUploadError('lost'))).toMatchObject({ kind: 'failed', reason: 'lost' });
    expect(classify(new Error('other'))).toBeUndefined();
  });
});
