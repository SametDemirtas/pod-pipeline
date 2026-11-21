import { describe, expect, it } from 'vitest';
import { characterCount, cutAtWord, firstCharacters, typedCharacterCount } from './characters.js';

describe('characters', () => {
  it('counts an emoji or a letter outside the basic plane as one', () => {
    expect(characterCount('mug 🌷')).toBe(5);
    expect(characterCount(' 𝒜 ')).toBe(3);
    expect(typedCharacterCount(' 𝒜 ')).toBe(1);
  });

  it('cuts without splitting a character', () => {
    expect(firstCharacters('🌷🌷🌷', 2)).toBe('🌷🌷');
  });

  it('cuts at the last space unless that loses more than half', () => {
    expect(cutAtWord('Tulip mug for tea', 12)).toBe('Tulip mug');
    expect(cutAtWord('Tulipmugfortea now', 10)).toBe('Tulipmugfo');
    expect(cutAtWord('short', 10)).toBe('short');
  });
});
