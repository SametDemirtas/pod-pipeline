import { busyFailure, serviceFailures, type ServiceFailure } from '@pod/adapter-http';
import {
  GEMINI,
  GeminiError,
  GeminiNotConnectedError,
  GeminiSceneUnfinishedError,
} from './errors.js';

/** Google's statuses for a rate limit and for a model overloaded for now. */
const BUSY: ReadonlySet<number | undefined> = new Set([429, 503]);

/**
 * Google answers a mistyped or expired key with 400 and a reason; other 400s
 * and 403s (a refused prompt, billing, a region) are failures a new key cannot
 * fix. A scene that did not finish may still be made and billed.
 */
function classifyGeminiError(error: unknown): ServiceFailure | undefined {
  const service = GEMINI;
  if (error instanceof GeminiNotConnectedError) return { kind: 'not-connected', service };
  if (error instanceof GeminiSceneUnfinishedError) {
    return { kind: 'interrupted', service, reason: error.reason };
  }
  if (!(error instanceof GeminiError)) return undefined;
  const refused =
    error.status === 401 ||
    error.reason === 'API_KEY_INVALID' ||
    error.reason === 'API_KEY_EXPIRED';
  if (refused) return { kind: 'not-connected', service };
  // A used-up daily or free-tier quota is answered with 429 too, but waiting does not cure it.
  if (BUSY.has(error.status) && !error.quotaUsedUp) {
    return busyFailure(service, error.retryAfterSeconds);
  }
  return { kind: 'failed', service, reason: error.message };
}

export const GEMINI_FAILURES = serviceFailures([GEMINI], classifyGeminiError);
