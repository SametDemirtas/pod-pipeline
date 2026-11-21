import {
  classifyServiceError,
  classifySignInError,
  serviceFailures,
  type ServiceFailure,
} from '@pod/adapter-http';
import { ETSY, ETSY_ERRORS, EtsyAccountWithoutShopError, EtsySignInError } from './errors.js';

/** A revoked app or sign-in reads as not connected, so the seller signs in again. */
function classifyEtsyError(error: unknown): ServiceFailure | undefined {
  if (error instanceof EtsySignInError) {
    return classifySignInError(error.cause, ETSY, classifyEtsyError);
  }
  return classifyServiceError(error, ETSY_ERRORS, {
    revoked: ({ status, code }) => status === 401 || code === 'invalid_grant',
    alsoFailed: [EtsyAccountWithoutShopError],
  });
}

export const ETSY_FAILURES = serviceFailures([ETSY], classifyEtsyError);
