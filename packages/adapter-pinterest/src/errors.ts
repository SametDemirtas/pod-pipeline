import { serviceErrors } from '@pod/adapter-http';

/** The name the seller knows the service by, in errors and messages. */
export const PINTEREST = 'Pinterest';

export const PINTEREST_ERRORS = serviceErrors(PINTEREST, 'sign in to Pinterest first');

/** No Pinterest account has been connected yet. */
export class PinterestNotConnectedError extends PINTEREST_ERRORS.NotConnectedError {}

/** Pinterest answered with an error status. */
export class PinterestApiError extends PINTEREST_ERRORS.ApiError {}

/** Pinterest answered, but not in the shape its documentation describes. */
export class UnexpectedPinterestResponseError extends PINTEREST_ERRORS.UnexpectedResponseError {}

/**
 * Getting a fresh access token failed, e.g. the connection broke or Pinterest
 * refused it. Nothing was sent with it, so a pin being made then is certainly not on Pinterest.
 */
export class PinterestSignInError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = new.target.name;
  }
}

/**
 * Creating a pin failed in a way that may come after Pinterest made it: a
 * server error, an answer that cannot be read, or a connection that broke off.
 */
export class PinterestPublishUncertainError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = new.target.name;
  }
}
