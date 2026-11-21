import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

export class MockupsInProgressError extends InProgressError {
  constructor() {
    super('MOCKUPS_IN_PROGRESS', 'Printful is still making the previous mockups');
  }
}

/** The upscaling engine is not installed next to the app. */
export class UpscalerUnavailableError extends AppError {
  constructor() {
    super('UPSCALER_UNAVAILABLE', 'The upscaling engine is not installed');
  }
}

/** One artwork is made larger at a time, as the work fills the graphics card. */
export class UpscaleInProgressError extends InProgressError {
  constructor() {
    super('UPSCALE_IN_PROGRESS', 'Another artwork is still being made larger');
  }
}

/** An artwork is turned once at a time, so a double click never turns it twice. */
export class RotateInProgressError extends InProgressError {
  constructor() {
    super('ROTATE_IN_PROGRESS', 'The artwork is still being turned');
  }
}

/** The engine stopped without a result, e.g. for lack of graphics memory. */
export class UpscaleFailedError extends AppError {
  constructor(reason: string) {
    super('UPSCALE_FAILED', `Upscaling failed: ${reason}`, { reason });
  }
}
