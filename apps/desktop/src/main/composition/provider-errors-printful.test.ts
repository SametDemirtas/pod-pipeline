import { describe, expect, it } from 'vitest';
import {
  FileHostNotConnectedError as HostNotConnected,
  FileHostRequestError,
} from '@pod/adapter-file-hosts';
import {
  PrintfulApiError,
  PrintfulFileError,
  PrintfulMockupError,
  PrintfulNotConnectedError as PrintfulMissing,
  PrintfulRequestError,
  UnexpectedPrintfulResponseError,
} from '@pod/adapter-printful';
import { toAppError } from './provider-errors.js';

describe('toAppError for Printful and the file hosts', () => {
  it.each([
    [new PrintfulMissing(), { code: 'PRINTFUL_NOT_CONNECTED' }],
    [new HostNotConnected('s3'), { code: 'FILE_HOST_NOT_CONNECTED' }],
    [new PrintfulApiError(401, 'invalid token'), { code: 'PRINTFUL_NOT_CONNECTED' }],
    [new PrintfulApiError(403, 'no access'), { code: 'PRINTFUL_NOT_CONNECTED' }],
    [
      new PrintfulApiError(500, 'busy'),
      { code: 'PROVIDER_FAILED', details: { service: 'Printful' } },
    ],
    [new PrintfulMockupError('task failed'), { code: 'PROVIDER_FAILED' }],
    [new PrintfulFileError('could not fetch'), { code: 'PROVIDER_FAILED' }],
    [new UnexpectedPrintfulResponseError('no result'), { code: 'PROVIDER_FAILED' }],
    [new PrintfulRequestError('not an id'), { code: 'PROVIDER_FAILED' }],
    [
      new FileHostRequestError('dropbox', 409, 'path/conflict'),
      { code: 'PROVIDER_FAILED', details: { service: 'Dropbox' } },
    ],
    [new FileHostRequestError('dropbox', 401, undefined), { code: 'FILE_HOST_NOT_CONNECTED' }],
    [
      new FileHostRequestError('dropbox', 400, 'invalid_grant'),
      { code: 'FILE_HOST_NOT_CONNECTED' },
    ],
    [
      new FileHostRequestError('s3', 403, 'InvalidAccessKeyId'),
      { code: 'FILE_HOST_NOT_CONNECTED' },
    ],
    [
      new FileHostRequestError('s3', 403, 'SignatureDoesNotMatch'),
      { code: 'FILE_HOST_NOT_CONNECTED' },
    ],
    [
      new FileHostRequestError('s3', 403, 'AccessDenied'),
      {
        code: 'PROVIDER_FAILED',
        details: {
          service: 'Cloudflare R2 or S3',
          reason: 'Cloudflare R2 or S3 answered 403 (AccessDenied)',
        },
      },
    ],
  ])('maps %s', (error, expected) => {
    expect(toAppError(error, 'Dropbox')).toMatchObject(expected);
  });
});
