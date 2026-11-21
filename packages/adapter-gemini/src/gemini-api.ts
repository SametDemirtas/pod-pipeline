import { parseJson } from '@pod/core';
import { retryAfterSeconds, sendWithRetries, sleep, type JsonObject } from '@pod/adapter-http';
import { GEMINI, GeminiError, GeminiUnreadableAnswerError } from './errors.js';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/** Google's statuses for a fault on its side that a moment often cures. */
const TRANSIENT_STATUSES = [500, 502, 503, 504];

/**
 * Busy statuses Google sends before it starts on a request; a 500, 502 or 504
 * may come after the model ran and billed, so those are never resent.
 */
const BUSY_STATUSES = [503];

/** A rate limit or a passing fault on Google's side, which a later try may get past. */
export function isTransient(status: number | undefined): boolean {
  return status === 429 || TRANSIENT_STATUSES.includes(status ?? 0);
}

export interface GeminiRequestOptions {
  /**
   * Times a rate limit or an overloaded model is tried again; only for requests
   * that make nothing on Google's side when they fail.
   */
  readonly retries?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** Sends one request with the key and returns the JSON body, or throws Gemini's reason. */
export async function geminiRequest(
  fetchFn: typeof fetch,
  apiKey: string,
  path: string,
  body?: unknown,
  options: GeminiRequestOptions = {},
): Promise<JsonObject> {
  const send = () =>
    fetchFn(`${GEMINI_API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      signal: AbortSignal.timeout(120_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const response = await sendWithRetries(send, {
    maxRetries: options.retries ?? 0,
    sleep: options.sleep ?? sleep,
    maxWaitSeconds: 60,
    alsoRetry: BUSY_STATUSES,
  });
  const parsed = parseJson(await response.text().catch(() => ''));
  const json = isObject(parsed) ? parsed : undefined;
  if (!response.ok) {
    const error = json?.['error'] as JsonObject | undefined;
    const message = typeof error?.['message'] === 'string' ? error['message'] : response.statusText;
    const wait = retryAfterSeconds(response, 0);
    throw new GeminiError(`${GEMINI} returned ${response.status}: ${message}`, {
      status: response.status,
      reason: reasonOf(error),
      retryAfterSeconds: wait > 0 ? wait : undefined,
      quotaUsedUp: quotaUsedUp(error, message),
    });
  }
  if (!json) throw new GeminiUnreadableAnswerError();
  return json;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A quota counted per day, or a free tier without any, by Google's quota details or its wording. */
const LASTING_QUOTA = /per ?day|daily|\blimit: 0\b/i;

/**
 * Whether a rate limit is a used-up daily or free-tier quota. Google names the
 * quota in its `QuotaFailure` details, e.g. `GenerateRequestsPerDayPerProjectPerModel-FreeTier`.
 */
function quotaUsedUp(error: JsonObject | undefined, message: string): boolean {
  const details = Array.isArray(error?.['details']) ? (error['details'] as JsonObject[]) : [];
  const quotas = details.flatMap((detail) =>
    Array.isArray(detail['violations'])
      ? (detail['violations'] as JsonObject[]).flatMap((violation) =>
          [violation['quotaId'], violation['quotaMetric']].filter(
            (name): name is string => typeof name === 'string',
          ),
        )
      : [],
  );
  return [...quotas, message].some((text) => LASTING_QUOTA.test(text));
}

/** The reason in Google's error details, e.g. `API_KEY_INVALID` for a mistyped key. */
function reasonOf(error: JsonObject | undefined): string | undefined {
  const details = Array.isArray(error?.['details']) ? (error['details'] as JsonObject[]) : [];
  const reason = details.find((detail) => typeof detail['reason'] === 'string')?.['reason'];
  return typeof reason === 'string' ? reason : undefined;
}
