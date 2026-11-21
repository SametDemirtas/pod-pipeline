import { describe, expect, it } from 'vitest';
import { FILE_HOST_FAILURES } from './classify-error.js';
import {
  FileHostRequestError,
  FileHostUnexpectedResponseError,
  FileTooLargeToShareError,
} from './errors.js';

describe('FILE_HOST_FAILURES', () => {
  it('reads keys R2 or S3 no longer accepts as not connected', () => {
    for (const error of [
      new FileHostRequestError('s3', 401, 'Unauthorized'),
      new FileHostRequestError('s3', 403, 'InvalidAccessKeyId'),
    ]) {
      expect(FILE_HOST_FAILURES.classify(error)).toEqual({
        kind: 'not-connected',
        service: 'Cloudflare R2 or S3',
      });
    }
    expect(
      FILE_HOST_FAILURES.classify(new FileHostRequestError('s3', 403, 'AccessDenied')),
    ).toMatchObject({ kind: 'failed' });
  });

  it('reads a rate limit as busy and an odd answer as failed', () => {
    expect(FILE_HOST_FAILURES.classify(new FileHostRequestError('s3', 429, 'SlowDown'))).toEqual({
      kind: 'busy',
      service: 'Cloudflare R2 or S3',
    });
    expect(
      FILE_HOST_FAILURES.classify(new FileHostUnexpectedResponseError('dropbox', 'no link')),
    ).toEqual({
      kind: 'failed',
      service: 'Dropbox',
      reason: 'Unexpected Dropbox response: no link',
    });
  });

  it('reads a busy store as busy, with the wait it asked for', () => {
    expect(
      FILE_HOST_FAILURES.classify(
        new FileHostRequestError('dropbox', 429, 'too_many_requests', 30),
      ),
    ).toEqual({ kind: 'busy', service: 'Dropbox', retryAfterSeconds: 30 });
    expect(FILE_HOST_FAILURES.classify(new FileHostRequestError('s3', 503, 'SlowDown'))).toEqual({
      kind: 'busy',
      service: 'Cloudflare R2 or S3',
    });
  });

  it('reads a file too large for the host as failed, naming the limit', () => {
    expect(
      FILE_HOST_FAILURES.classify(
        new FileTooLargeToShareError('dropbox', 160 * 2 ** 20, 150 * 2 ** 20),
      ),
    ).toEqual({
      kind: 'failed',
      service: 'Dropbox',
      reason: 'Dropbox takes files up to 150 MB in one upload; this one is 160 MB',
    });
  });
});
