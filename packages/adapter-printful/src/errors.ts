import { serviceErrors } from '@pod/adapter-http';

/** The name the seller knows the service by, in errors and messages. */
export const PRINTFUL = 'Printful';

export const PRINTFUL_ERRORS = serviceErrors(PRINTFUL, 'add an API token first');

/** No Printful token has been saved yet. */
export class PrintfulNotConnectedError extends PRINTFUL_ERRORS.NotConnectedError {}

/** Printful answered with an error status. */
export class PrintfulApiError extends PRINTFUL_ERRORS.ApiError {}

/** Printful answered, but not in the shape its documentation describes. */
export class UnexpectedPrintfulResponseError extends PRINTFUL_ERRORS.UnexpectedResponseError {}

/** The app refused to send a request whose input Printful cannot take. */
export class PrintfulRequestError extends PRINTFUL_ERRORS.RequestError {}

/** A mockup task failed at Printful or did not finish in time. */
export class PrintfulMockupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Printful could not fetch or store a print file. */
export class PrintfulFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
