import type { ApiResult } from '@pod/contracts';
import type { Operation } from './operations.js';
import { toApiError, type ErrorLogger } from './to-api-error.js';

/** Runs an operation and reports the outcome as a result; never throws. */
export async function invoke(
  operation: Operation,
  raw: unknown,
  log: ErrorLogger,
): Promise<ApiResult<unknown>> {
  try {
    return { ok: true, value: await operation.handle(raw) };
  } catch (error) {
    return { ok: false, error: toApiError(error, log) };
  }
}
