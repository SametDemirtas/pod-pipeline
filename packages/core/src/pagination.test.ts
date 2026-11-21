import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePageRequest } from './pagination.js';

describe('normalizePageRequest', () => {
  it('applies the default page size', () => {
    expect(normalizePageRequest({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it('passes the cursor through untouched', () => {
    expect(normalizePageRequest({ limit: 5, cursor: ' abc ' })).toEqual({
      limit: 5,
      cursor: ' abc ',
    });
  });

  it('rejects an empty cursor', () => {
    expect(() => normalizePageRequest({ cursor: '' })).toThrow(ValidationError);
  });

  it.each([0, -1, 1.5, MAX_PAGE_SIZE + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects limit %s',
    (limit) => {
      expect(() => normalizePageRequest({ limit })).toThrow(ValidationError);
    },
  );

  it('accepts the boundaries', () => {
    expect(normalizePageRequest({ limit: 1 }).limit).toBe(1);
    expect(normalizePageRequest({ limit: MAX_PAGE_SIZE }).limit).toBe(MAX_PAGE_SIZE);
  });
});
