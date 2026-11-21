import { describe, expect, it } from 'vitest';
import { LISTING_LIMITS } from './limits.js';
import { aiNoteKind, descriptionLimit } from './ai-note-rules.js';

describe('aiNoteKind', () => {
  it.each([
    [{ scenes: false, designs: false }, null],
    [{ scenes: true, designs: false }, 'scenes'],
    [{ scenes: false, designs: true }, 'designs'],
    [{ scenes: true, designs: true }, 'both'],
  ] as const)('names the note for %j', (use, kind) => {
    expect(aiNoteKind(use)).toBe(kind);
  });
});

describe('descriptionLimit', () => {
  it('leaves room for a note on AI only when the listing carries one', () => {
    expect(descriptionLimit(null)).toBe(LISTING_LIMITS.description);
    expect(descriptionLimit('scenes')).toBe(LISTING_LIMITS.description - LISTING_LIMITS.aiNote);
  });
});
