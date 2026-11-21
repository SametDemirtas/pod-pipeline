import { busyFailure, serviceFailures, type ServiceFailure } from '@pod/adapter-http';
import {
  FILE_HOST_LABELS,
  FileHostNotConnectedError,
  FileHostRequestError,
  FileHostUnexpectedResponseError,
  FileTooLargeToShareError,
} from './errors.js';

/** S3 answers 403 with these codes when the stored keys no longer work; R2 may answer 401. */
const S3_REVOKED = new Set(['InvalidAccessKeyId', 'SignatureDoesNotMatch']);

/**
 * Revoked access reads as not connected, so the seller connects the file host
 * again; a rate limit as busy; other refusals and odd answers as failed.
 */
function classifyFileHostError(error: unknown): ServiceFailure | undefined {
  if (error instanceof FileHostNotConnectedError) {
    return { kind: 'not-connected', service: FILE_HOST_LABELS[error.host] };
  }
  if (
    error instanceof FileHostUnexpectedResponseError ||
    error instanceof FileTooLargeToShareError
  ) {
    return { kind: 'failed', service: FILE_HOST_LABELS[error.host], reason: error.message };
  }
  if (!(error instanceof FileHostRequestError)) return undefined;
  const service = FILE_HOST_LABELS[error.host];
  // 503 is a store or Dropbox busy for now, which a later try gets past.
  if (error.status === 429 || error.status === 503) {
    return busyFailure(service, error.retryAfterSeconds);
  }
  const revoked =
    error.host === 'dropbox'
      ? error.status === 401 || error.reason === 'invalid_grant'
      : error.status === 401 || (error.status === 403 && S3_REVOKED.has(error.reason ?? ''));
  return revoked
    ? { kind: 'not-connected', service }
    : { kind: 'failed', service, reason: error.message };
}

export const FILE_HOST_FAILURES = serviceFailures(
  Object.values(FILE_HOST_LABELS),
  classifyFileHostError,
);
