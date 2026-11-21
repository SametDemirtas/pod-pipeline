import { describe, expect, it } from 'vitest';
import {
  PinterestApiError,
  PinterestNotConnectedError,
  PinterestPublishUncertainError,
  PinterestSignInError,
  UnexpectedPinterestResponseError,
} from '@pod/adapter-pinterest';
import { PinSentUnconfirmedError } from '../application/errors/pin-errors.js';
import {
  ProviderFailedError,
  ProviderInterruptedError,
  ProviderUnavailableError,
} from '../application/errors/provider-errors.js';
import { toAppError } from './provider-errors.js';

describe('toAppError for Pinterest', () => {
  it.each([
    [new PinterestNotConnectedError(), { code: 'PINTEREST_NOT_CONNECTED' }],
    [new PinterestApiError(400, 'expired', 'invalid_grant'), { code: 'PINTEREST_NOT_CONNECTED' }],
    [new PinterestApiError(401, 'revoked'), { code: 'PINTEREST_NOT_CONNECTED' }],
    [
      new PinterestApiError(400, 'Invalid board'),
      { code: 'PROVIDER_FAILED', details: { service: 'Pinterest' } },
    ],
    [new UnexpectedPinterestResponseError('no id'), { code: 'PROVIDER_FAILED' }],
  ])('maps %s', (error, expected) => {
    expect(toAppError(error, 'Pinterest')).toMatchObject(expected);
  });

  it('marks a pin Pinterest may have made as unconfirmed, keeping its reason', () => {
    const uncertain = new PinterestPublishUncertainError(new PinterestApiError(502, 'Bad gateway'));

    expect(toAppError(uncertain, 'Pinterest')).toBeInstanceOf(PinSentUnconfirmedError);
    expect(toAppError(uncertain, 'Pinterest')).toMatchObject({
      code: 'PIN_OUTCOME_UNKNOWN',
      message: expect.stringContaining('Pinterest returned 502: Bad gateway') as string,
    });
  });

  it.each([
    ['broke off', 'ECONNRESET', ProviderFailedError],
    ['never got through', 'ENOTFOUND', ProviderUnavailableError],
  ])('reports a token refresh that %s as changing nothing', (_case, code, expected) => {
    const lost = new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });

    expect(toAppError(new PinterestSignInError(lost), 'Pinterest')).toBeInstanceOf(expected);
  });

  it('keeps Pinterest errors outside creating a pin plain failures', () => {
    const failed = toAppError(new PinterestApiError(502, 'Bad gateway'), 'Pinterest');

    expect(failed).toBeInstanceOf(ProviderFailedError);
    expect(failed).not.toBeInstanceOf(ProviderInterruptedError);
  });
});
