import { ZodError } from 'zod';
import type { ApiErrorCode, ApiErrorPayload } from '@pod/contracts';
import { isDomainError } from '@pod/core';
import { AppError } from '../shared/app-error.js';
import { redact } from '../shared/redact.js';

export type ErrorLogger = (error: unknown) => void;

/** A detail as the window, the assistants and stored runs may see it, without secrets. */
function redactDetail(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDetail);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [key, redactDetail(inner)]),
  );
}

function redacted(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiErrorPayload {
  return {
    code,
    message: redact(message),
    details: Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, redactDetail(value)]),
    ),
  };
}

/**
 * Converts anything thrown behind the API into a payload a client can act on.
 * Unexpected errors are logged and reported without internal details. Every
 * payload leaves here, so services' messages are stripped of secrets here.
 * Why a pin failed is stored rather than thrown, so it is redacted as it is
 * saved, in `redacting-pins.ts`.
 */
export function toApiError(error: unknown, log: ErrorLogger): ApiErrorPayload {
  if (isDomainError(error)) {
    // Fails to compile if the core gains an error code the API does not list.
    const code: ApiErrorCode = error.code;
    return redacted(code, error.message, error.details);
  }
  if (error instanceof AppError) return redacted(error.code, error.message, error.details);
  if (error instanceof ZodError) {
    return {
      code: 'INVALID_REQUEST',
      message: 'The request is not valid',
      details: { issues: error.issues.map(({ path, message }) => ({ path, message })) },
    };
  }
  log(error);
  return { code: 'INTERNAL', message: 'Something went wrong', details: {} };
}
