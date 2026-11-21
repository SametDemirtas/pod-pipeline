import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

/** The service refused the credentials or could not be reached while connecting. */
export class ConnectionFailedError extends AppError {
  constructor(service: string, reason: string) {
    super('CONNECTION_FAILED', `Could not connect ${service}: ${reason}`, { service, reason });
  }
}

export class ConnectionInProgressError extends InProgressError {
  constructor() {
    super('CONNECTION_IN_PROGRESS', 'Another connection change is still running');
  }
}

/**
 * The app never names a store in its Printful requests, so the token must
 * reach exactly one store; an account-wide token would pass the check and fail
 * at the first store request.
 */
export class PrintfulTokenNotSingleStoreError extends AppError {
  constructor(readonly storeCount: number) {
    super(
      'PRINTFUL_TOKEN_NOT_SINGLE_STORE',
      `The Printful token reaches ${storeCount} stores instead of one`,
      { storeCount },
    );
  }
}

export class PrintfulNotConnectedError extends AppError {
  constructor() {
    super('PRINTFUL_NOT_CONNECTED', 'Connect Printful in the settings first');
  }
}

export class FileHostNotConnectedError extends AppError {
  constructor() {
    super('FILE_HOST_NOT_CONNECTED', 'Connect Dropbox or Cloudflare R2 in the settings first');
  }
}

export class EtsyNotConnectedError extends AppError {
  constructor() {
    super('ETSY_NOT_CONNECTED', 'Connect Etsy in the settings first');
  }
}

/** The chosen AI service has no key saved, or refused the one saved. */
export class AiNotConnectedError extends AppError {
  constructor(service: string) {
    super('AI_NOT_CONNECTED', `Add a working ${service} key in the settings first`, { service });
  }
}

export class PinterestNotConnectedError extends AppError {
  constructor() {
    super('PINTEREST_NOT_CONNECTED', 'Pinterest is not connected; sign in to Pinterest first');
  }
}
