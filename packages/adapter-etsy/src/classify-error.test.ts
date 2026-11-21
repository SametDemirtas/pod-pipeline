import { describe, expect, it } from 'vitest';
import { ETSY_FAILURES } from './classify-error.js';
import {
  EtsyAccountWithoutShopError,
  EtsyApiError,
  EtsyRequestError,
  EtsySignInError,
} from './errors.js';

describe('ETSY_FAILURES', () => {
  it('reads an account without a shop and a refused request as failed', () => {
    expect(ETSY_FAILURES.classify(new EtsyAccountWithoutShopError())).toMatchObject({
      kind: 'failed',
      service: 'Etsy',
    });
    expect(ETSY_FAILURES.classify(new EtsyRequestError('No Etsy category for lamp'))).toEqual({
      kind: 'failed',
      service: 'Etsy',
      reason: 'No Etsy category for lamp',
    });
  });

  it('reads a revoked sign-in as not connected and a rate limit as busy', () => {
    expect(ETSY_FAILURES.classify(new EtsyApiError(400, 'expired', 'invalid_grant'))).toEqual({
      kind: 'not-connected',
      service: 'Etsy',
    });
    expect(ETSY_FAILURES.classify(new EtsyApiError(429, 'slow down', undefined, 5))).toEqual({
      kind: 'busy',
      service: 'Etsy',
      retryAfterSeconds: 5,
    });
  });

  it('reads a sign-in that broke off by how the connection failed', () => {
    const broken = (code: string) =>
      new EtsySignInError(new TypeError('fetch failed', { cause: { code } }));

    expect(ETSY_FAILURES.classify(broken('ECONNRESET'))).toEqual({
      kind: 'failed',
      service: 'Etsy',
      reason: 'connection lost',
    });
    expect(ETSY_FAILURES.classify(broken('ENOTFOUND'))).toEqual({
      kind: 'unreachable',
      service: 'Etsy',
    });
  });
});
