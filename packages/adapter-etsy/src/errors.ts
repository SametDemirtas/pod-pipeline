import { serviceErrors } from '@pod/adapter-http';
import { DraftUnconfirmedError } from '@pod/core';

/** The name the seller knows the service by, in errors and messages. */
export const ETSY = 'Etsy';

export const ETSY_ERRORS = serviceErrors(ETSY, 'sign in to Etsy first');

/** No Etsy account has been connected yet. */
export class EtsyNotConnectedError extends ETSY_ERRORS.NotConnectedError {}

/** Etsy answered with an error status. */
export class EtsyApiError extends ETSY_ERRORS.ApiError {}

/**
 * The answer to creating a draft broke off or was a server error. Etsy may have made the draft
 * anyway, and the app never learnt its id, so it cannot remove it.
 */
export class EtsyDraftUnconfirmedError extends DraftUnconfirmedError {}

/**
 * Getting a fresh access token failed, e.g. the connection broke or Etsy
 * refused it. Nothing was sent with it, so a draft being made then is certainly not on Etsy.
 */
export class EtsySignInError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = new.target.name;
  }
}

/** The app refused to send a request whose input Etsy cannot take. */
export class EtsyRequestError extends ETSY_ERRORS.RequestError {}

/**
 * The shop's currency changed after the seller entered the prices; Etsy would read
 * the same numbers in the new currency.
 */
export class EtsyCurrencyChangedError extends Error {
  constructor(
    /** The shop's currency now, e.g. `EUR`. */
    readonly current: string,
    entered: string,
  ) {
    super(`The shop's currency is now ${current}, but the prices were entered in ${entered}`);
    this.name = new.target.name;
  }
}

/** Etsy answered, but not in the shape its documentation describes. */
export class UnexpectedEtsyResponseError extends ETSY_ERRORS.UnexpectedResponseError {}

/** The signed-in Etsy account has not opened a shop, so there is nothing to list in. */
export class EtsyAccountWithoutShopError extends Error {
  constructor() {
    super('this Etsy account has no shop');
    this.name = new.target.name;
  }
}
