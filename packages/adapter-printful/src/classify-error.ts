import { classifyServiceError, serviceFailures, type ServiceFailure } from '@pod/adapter-http';
import { PRINTFUL, PRINTFUL_ERRORS, PrintfulFileError, PrintfulMockupError } from './errors.js';

/** A token Printful refuses reads as not connected, so the seller enters a new one. */
function classifyPrintfulError(error: unknown): ServiceFailure | undefined {
  return classifyServiceError(error, PRINTFUL_ERRORS, {
    revoked: ({ status }) => status === 401 || status === 403,
    alsoFailed: [PrintfulMockupError, PrintfulFileError],
  });
}

export const PRINTFUL_FAILURES = serviceFailures([PRINTFUL], classifyPrintfulError);
