import { describe, expect, it } from 'vitest';
import { missingText } from './prepared-text.js';

const text = { title: 'T', description: 'D', tags: [] };
const prepared = { language: 'en-US', text, translations: [{ language: 'de', text }] };

describe('missingText', () => {
  it('keeps text in the main language and asks only for the translations it lacks', () => {
    expect(missingText(prepared, ['en-US', 'de', 'fr'])).toEqual({
      language: 'en-US',
      kept: prepared,
      translations: ['fr'],
    });
  });

  it('writes everything anew for another main language, and in English for none', () => {
    expect(missingText(prepared, ['de', 'fr'])).toEqual({
      language: 'de',
      kept: null,
      translations: ['fr'],
    });
    expect(missingText(null, [])).toEqual({ language: 'en-US', kept: null, translations: [] });
  });
});
