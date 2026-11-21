import {
  classifyServiceError,
  classifySignInError,
  serviceFailures,
  type ServiceFailure,
} from '@pod/adapter-http';
import { PINTEREST, PINTEREST_ERRORS, PinterestSignInError } from './errors.js';

/**
 * A revoked app or an expired sign-in reads as not connected, so the seller
 * signs in again. A pin that may have been made anyway is not classified here:
 * the app tells it apart itself, so it is not simply sent again.
 */
function classifyPinterestError(error: unknown): ServiceFailure | undefined {
  if (error instanceof PinterestSignInError) {
    return classifySignInError(error.cause, PINTEREST, classifyPinterestError);
  }
  return classifyServiceError(error, PINTEREST_ERRORS, {
    revoked: ({ status, code }) => status === 401 || code === 'invalid_grant',
  });
}

export const PINTEREST_FAILURES = serviceFailures([PINTEREST], classifyPinterestError);
