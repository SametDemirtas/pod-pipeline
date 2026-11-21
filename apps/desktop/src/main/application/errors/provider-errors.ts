import { AppError } from '../../shared/app-error.js';

/** An outside service refused a request or answered with an error. */
export class ProviderFailedError extends AppError {
  constructor(service: string, reason: string) {
    super('PROVIDER_FAILED', `${service} failed: ${reason}`, { service, reason });
  }
}

/**
 * The request broke off after it was sent, so the service may have done the
 * work, and billed it, anyway; trying again at once could do it twice.
 */
export class ProviderInterruptedError extends AppError {
  constructor(service: string, reason: string) {
    super(
      'PROVIDER_INTERRUPTED',
      `${service} did not answer in full: ${reason}; it may have done the work anyway`,
      { service, reason },
    );
  }
}

/** The service could not be reached at all, so nothing was sent; trying later is safe. */
export class ProviderUnavailableError extends ProviderFailedError {
  constructor(service: string) {
    super(service, 'network unavailable');
  }
}

/** The service turned the request away for now, over a rate limit or overload. */
export class ProviderBusyError extends AppError {
  constructor(service: string, retryAfterSeconds?: number) {
    super('PROVIDER_BUSY', `${service} is busy; try again later`, {
      service,
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    });
  }
}
