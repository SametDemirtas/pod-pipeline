import { DESIGN_KEY } from './catalog/keys.js';
import { ValidationError } from './errors.js';

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  /** Number of items to return, between 1 and {@link MAX_PAGE_SIZE}. */
  readonly limit: number;
  /** Opaque cursor returned as `nextCursor` by the previous page. */
  readonly cursor?: string | undefined;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** `null` when this is the last page. */
  readonly nextCursor: string | null;
  /** Number of items matching the filters, across all pages. */
  readonly total: number;
}

export function normalizePageRequest(input: {
  limit?: number | undefined;
  cursor?: string | undefined;
}): PageRequest {
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ValidationError('limit', `must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (input.cursor === undefined) return { limit };
  if (input.cursor === '') throw new ValidationError('cursor', 'must not be empty');
  return { limit, cursor: input.cursor };
}

/** Cursor that continues a design listing after `designKey`. */
export function encodeDesignCursor(designKey: string): string {
  return JSON.stringify({ after: designKey });
}

/** Reads a cursor made by {@link encodeDesignCursor}; rejects anything else. */
export function decodeDesignCursor(cursor: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    parsed = undefined;
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'after' in parsed &&
    typeof parsed.after === 'string' &&
    DESIGN_KEY.test(parsed.after)
  ) {
    return parsed.after;
  }
  throw new ValidationError('cursor', 'is not a valid page cursor');
}
