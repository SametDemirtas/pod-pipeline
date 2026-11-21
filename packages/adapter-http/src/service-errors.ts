import type { ServiceFailure } from './failures.js';
import { busyFailure } from './sdk-errors.js';

/** An error class of a service adapter, as {@link classifyServiceError} is given it. */
export type ErrorClass = abstract new (...args: never[]) => Error;

/** An error status the service answered with. */
export interface ServiceApiError extends Error {
  readonly status: number;
  /** OAuth error code from a sign-in or refresh, e.g. `invalid_grant`. */
  readonly code?: string | undefined;
  /** The wait a rate-limited answer asked for. */
  readonly retryAfterSeconds?: number | undefined;
}

export interface ServiceErrors {
  readonly service: string;
  readonly NotConnectedError: new () => Error;
  readonly ApiError: new (
    status: number,
    message: string,
    code?: string,
    retryAfterSeconds?: number,
  ) => ServiceApiError;
  readonly UnexpectedResponseError: new (what: string) => Error;
  readonly RequestError: new (message: string) => Error;
}

/**
 * The errors every service adapter raises, named after the service. An adapter
 * extends each, e.g. `class EtsyApiError extends etsy.ApiError {}`, so its own
 * class names show in logs.
 */
export function serviceErrors(service: string, connectFirst: string): ServiceErrors {
  /** Nothing is connected yet: no token or sign-in is stored. */
  class NotConnectedError extends Error {
    constructor() {
      super(`${service} is not connected; ${connectFirst}`);
      this.name = new.target.name;
    }
  }

  /** The service answered with an error status. */
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
      /** OAuth error code from a sign-in or refresh, e.g. `invalid_grant`. */
      readonly code?: string,
      /** The wait a rate-limited answer asked for. */
      readonly retryAfterSeconds?: number,
    ) {
      super(`${service} returned ${status}: ${message}`);
      this.name = new.target.name;
    }
  }

  /** The service answered, but not in the shape its documentation describes. */
  class UnexpectedResponseError extends Error {
    constructor(what: string) {
      super(`Unexpected ${service} response: ${what}`);
      this.name = new.target.name;
    }
  }

  /** The app refused to send a request whose input the service cannot take. */
  class RequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = new.target.name;
    }
  }

  return { service, NotConnectedError, ApiError, UnexpectedResponseError, RequestError };
}

export interface ServiceErrorRules {
  /** An error status that means the stored token or sign-in no longer works. */
  readonly revoked: (error: ServiceApiError) => boolean;
  /** The adapter's own errors that are plain failures too. */
  readonly alsoFailed?: readonly ErrorClass[];
}

/**
 * How a service's error reaches the seller: missing or revoked access reads
 * as not connected, so the seller connects again; a rate limit as busy, with
 * the wait it asked for; the service's other errors as failed. `undefined`
 * for an error that is not the service's.
 */
export function classifyServiceError(
  error: unknown,
  errors: ServiceErrors,
  rules: ServiceErrorRules,
): ServiceFailure | undefined {
  const { service } = errors;
  if (error instanceof errors.NotConnectedError) return { kind: 'not-connected', service };
  if (error instanceof errors.ApiError && rules.revoked(error)) {
    return { kind: 'not-connected', service };
  }
  // 503 is a service busy for now, which a later try gets past.
  if (error instanceof errors.ApiError && (error.status === 429 || error.status === 503)) {
    return busyFailure(service, error.retryAfterSeconds);
  }
  const failed: readonly ErrorClass[] = [
    errors.ApiError,
    errors.UnexpectedResponseError,
    errors.RequestError,
    ...(rules.alsoFailed ?? []),
  ];
  if (failed.some((type) => error instanceof type)) {
    return { kind: 'failed', service, reason: (error as Error).message };
  }
  return undefined;
}
