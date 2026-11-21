import { AppError } from '../../shared/app-error.js';

/** Other work holds the service for now; nothing was done, so asking again later is safe. */
export abstract class InProgressError extends AppError {}
