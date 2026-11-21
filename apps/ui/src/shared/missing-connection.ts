import { ApiError, type ApiErrorCode } from '@pod/contracts/client';
import { apiErrorCode } from './api-error-code.js';
import type { ConnectionNoticeProps } from './ConnectionNotice.js';

const CONNECTION_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'PRINTFUL_NOT_CONNECTED',
  'FILE_HOST_NOT_CONNECTED',
  'AI_NOT_CONNECTED',
]);

/** The connection the user sets up in the settings rather than trying again, if that is the error. */
export function missingConnection(error: unknown): ConnectionNoticeProps | null {
  const code = apiErrorCode(error);
  if (code === null || !CONNECTION_CODES.has(code)) return null;
  return { code, details: error instanceof ApiError ? error.details : {} };
}
