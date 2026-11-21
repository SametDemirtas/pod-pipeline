import { describe, expect, it } from 'vitest';
import type { DesignRevisionDto } from '@pod/contracts/client';
import { importedRevisionOf } from './imported-revision.js';

const entry = (revision: number, changes: Partial<DesignRevisionDto> = {}) =>
  ({ revision, upscaleModel: null, rotation: null, ...changes }) as DesignRevisionDto;

describe('importedRevisionOf', () => {
  it('passes over copies made larger or turned in the app', () => {
    const revisions = [
      entry(4, { rotation: 90 }),
      entry(3, { upscaleModel: 'photo' }),
      entry(2),
      entry(1),
    ];

    expect(importedRevisionOf({ revision: 4, revisions })).toBe(2);
    expect(importedRevisionOf({ revision: 2, revisions: revisions.slice(2) })).toBe(2);
  });

  it('takes the current revision when no imported one is listed', () => {
    expect(importedRevisionOf({ revision: 3, revisions: [] })).toBe(3);
  });
});
