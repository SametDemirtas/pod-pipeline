import OpenAI from 'openai';
import {
  busyFailure,
  classifySdkConnectionError,
  retryAfterOf,
  serviceFailures,
  type ServiceFailure,
} from '@pod/adapter-http';
import {
  OpenAiNotConnectedError,
  OpenAiSceneUnfinishedError,
  OpenAiVendorError,
} from './errors.js';
import { DEEPSEEK, KIMI, OPENAI } from './vendors.js';

/** Statuses of a vendor overloaded for now, e.g. DeepSeek or Kimi short of servers. */
const OVERLOADED: ReadonlySet<number> = new Set([503, 529]);

/** How an error from this adapter should reach the seller; `undefined` for other errors. */
function classifyOpenAiError(error: unknown): ServiceFailure | undefined {
  if (error instanceof OpenAiNotConnectedError) {
    return { kind: 'not-connected', service: error.service };
  }
  if (error instanceof OpenAiSceneUnfinishedError) {
    return { kind: 'interrupted', service: error.service, reason: 'no answer' };
  }
  if (!(error instanceof OpenAiVendorError)) return undefined;
  const { service, cause } = error;
  // A refused key needs a new one; a key without access to a model gets the reason instead.
  if (cause instanceof OpenAI.AuthenticationError) return { kind: 'not-connected', service };
  const connection = classifySdkConnectionError(cause, service, {
    timeout: OpenAI.APIConnectionTimeoutError,
    connection: OpenAI.APIConnectionError,
  });
  if (connection) return connection;
  // Used-up credit is answered with 429 too, but waiting does not cure it.
  if (cause instanceof OpenAI.RateLimitError && cause.code !== 'insufficient_quota') {
    return busyFailure(service, retryAfterOf(cause.headers));
  }
  if (
    cause instanceof OpenAI.APIError &&
    typeof cause.status === 'number' &&
    OVERLOADED.has(cause.status)
  ) {
    return busyFailure(service, retryAfterOf(cause.headers));
  }
  return { kind: 'failed', service, reason: error.message };
}

export const OPENAI_COMPATIBLE_FAILURES = serviceFailures(
  [OPENAI.service, DEEPSEEK.service, KIMI.service],
  classifyOpenAiError,
);
