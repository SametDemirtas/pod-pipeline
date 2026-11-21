import { describe, expect, it } from 'vitest';
import {
  EtsyApiError,
  EtsyCurrencyChangedError,
  EtsyDraftUnconfirmedError,
  EtsyNotConnectedError as EtsyMissing,
  EtsyRequestError,
  UnexpectedEtsyResponseError,
} from '@pod/adapter-etsy';
import { toAppError } from './provider-errors.js';

describe('toAppError for Etsy', () => {
  it.each([
    [new EtsyMissing(), { code: 'ETSY_NOT_CONNECTED' }],
    [new EtsyApiError(401, 'invalid token'), { code: 'ETSY_NOT_CONNECTED' }],
    [new EtsyApiError(400, 'expired', 'invalid_grant'), { code: 'ETSY_NOT_CONNECTED' }],
    [
      new EtsyApiError(400, 'Price must be above 0.20'),
      { code: 'PROVIDER_FAILED', details: { service: 'Etsy' } },
    ],
    [new UnexpectedEtsyResponseError('no listing id'), { code: 'PROVIDER_FAILED' }],
    [new EtsyRequestError('too many variations'), { code: 'PROVIDER_FAILED' }],
    [new EtsyDraftUnconfirmedError(), { code: 'DRAFT_UNCONFIRMED' }],
    [
      new EtsyCurrencyChangedError('EUR', 'USD'),
      { code: 'SHOP_CURRENCY_CHANGED', details: { currency: 'EUR' } },
    ],
  ])('maps %s', (error, expected) => {
    expect(toAppError(error, 'Etsy')).toMatchObject(expected);
  });
});
