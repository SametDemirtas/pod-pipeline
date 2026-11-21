import Anthropic from '@anthropic-ai/sdk';
import {
  busyFailure,
  classifySdkConnectionError,
  retryAfterOf,
  serviceFailures,
  type ServiceFailure,
} from '@pod/adapter-http';
import { AnthropicNotConnectedError, CLAUDE } from './errors.js';

/** Anthropic's status for an API overloaded across the board. */
const OVERLOADED = 529;

/** How an error from this adapter should reach the seller; `undefined` for other errors. */
function classifyAnthropicError(error: unknown): ServiceFailure | undefined {
  // A refused key needs a new one; a key without access to a model gets the reason instead.
  if (
    error instanceof AnthropicNotConnectedError ||
    error instanceof Anthropic.AuthenticationError
  ) {
    return { kind: 'not-connected', service: CLAUDE };
  }
  const connection = classifySdkConnectionError(error, CLAUDE, {
    timeout: Anthropic.APIConnectionTimeoutError,
    connection: Anthropic.APIConnectionError,
  });
  if (connection) return connection;
  if (
    error instanceof Anthropic.RateLimitError ||
    (error instanceof Anthropic.APIError && error.status === OVERLOADED)
  ) {
    return busyFailure(CLAUDE, retryAfterOf(error.headers));
  }
  if (error instanceof Anthropic.APIError) {
    return { kind: 'failed', service: CLAUDE, reason: error.message };
  }
  return undefined;
}

export const CLAUDE_FAILURES = serviceFailures([CLAUDE], classifyAnthropicError);
