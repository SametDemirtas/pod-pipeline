import { DRAFT_UNCONFIRMED_MESSAGE, errorCodeOf } from '../errors.js';

/**
 * Failures after which Etsy may hold a draft the app does not know of, so
 * creating it again could make a second one; the seller checks the shop first.
 */
export const DRAFT_MAY_EXIST_CODES = [
  'DRAFT_UNCONFIRMED',
  'DRAFT_LEFT_BEHIND',
  'DRAFTS_NOT_CHECKED',
] as const;

/**
 * Why a design's draft may be on Etsy without the app knowing: the error the
 * draft step ended with, kept until the seller checked the shop's drafts.
 */
export interface DraftCheck {
  readonly step: 'draft';
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** The draft check an error makes, when it means Etsy may hold the draft. */
export function draftCheckOf(error: unknown): DraftCheck | undefined {
  if (!leavesDraftUnknown(error)) return undefined;
  const details = 'details' in error ? (error.details as Readonly<Record<string, unknown>>) : {};
  return { step: 'draft', code: String(errorCodeOf(error)), message: error.message, details };
}

/** The check kept while Etsy is asked for a draft, and after an unknown ending. */
export const DRAFT_UNCONFIRMED: DraftCheck = {
  step: 'draft',
  code: 'DRAFT_UNCONFIRMED',
  message: DRAFT_UNCONFIRMED_MESSAGE,
  details: {},
};

/** Whether `error` means the marketplace may hold a draft the app does not know of. */
export function leavesDraftUnknown(error: unknown): error is Error {
  const code = errorCodeOf(error);
  return error instanceof Error && DRAFT_MAY_EXIST_CODES.some((known) => known === code);
}
