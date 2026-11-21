import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

export class ResearchInProgressError extends InProgressError {
  constructor() {
    super('RESEARCH_IN_PROGRESS', 'The previous Etsy search is still running');
  }
}

export class ResearchRateLimitedError extends AppError {
  constructor(waitMs: number) {
    const retryAfterSeconds = Math.ceil(waitMs / 1000);
    super(
      'RESEARCH_RATE_LIMITED',
      `Etsy was searched too often in a short time; search again in ${String(retryAfterSeconds)} seconds`,
      { retryAfterSeconds },
    );
  }
}

export class ResearchCancelledError extends AppError {
  constructor() {
    super('RESEARCH_CANCELLED', 'The Etsy window was closed before the results showed');
  }
}

/** Etsy kept asking for a person to prove they are searching, and nobody did. */
export class ResearchBlockedError extends AppError {
  constructor() {
    super('RESEARCH_BLOCKED', 'Etsy asked to prove a person is searching, and nobody did in time');
  }
}

/** Etsy changed its search page, so the app cannot read the results until it is updated. */
export class ResearchPageChangedError extends AppError {
  constructor() {
    super('RESEARCH_PAGE_CHANGED', "Etsy's search page no longer reads as the app expects");
  }
}
