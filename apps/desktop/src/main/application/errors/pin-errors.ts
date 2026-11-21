import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

/** Sending a pin broke off or failed on Pinterest's side, so the pin may exist anyway. */
export class PinSentUnconfirmedError extends AppError {
  constructor(reason: string) {
    super(
      'PIN_OUTCOME_UNKNOWN',
      `Pinterest did not confirm the pin; it may exist anyway: ${reason}`,
    );
  }
}

export class PinInProgressError extends InProgressError {
  constructor() {
    super('PIN_IN_PROGRESS', 'The previous pin is still being made');
  }
}
