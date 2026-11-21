import { ApiError, isApiErrorCode, type ApiErrorCode } from '@pod/contracts/client';

/** The error's code when the API sent a known one, `null` for anything else. */
export function apiErrorCode(error: unknown): ApiErrorCode | null {
  return error instanceof ApiError && isApiErrorCode(error.code) ? error.code : null;
}
