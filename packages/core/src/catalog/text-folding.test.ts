import { describe, expect, it } from 'vitest';
import { foldForSearch, foldLetters, normalizeLabel } from './text-folding.js';

describe('foldForSearch', () => {
  it.each([
    ['İSTANBUL', 'istanbul'],
    ['Istanbul', 'istanbul'],
    ['Kırağı Bahçesi', 'kiragi bahcesi'],
    ['Große', 'grosse'],
    ['100% Cozy_Nights', '100% cozy_nights'],
    ['01-T-Shirt', '01 t shirt'],
  ])('folds %j to %j', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });
});

describe('normalizeLabel', () => {
  it.each([
    ['Telefon Kılıfı', 'telefon kilifi'],
    ['TELEFON_KILIFI', 'telefon kilifi'],
    ['  Handyhülle ', 'handyhulle'],
    ['Straße', 'strasse'],
    ['throw-blanket.v2', 'throw blanket v2'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected);
  });
});

describe('foldLetters', () => {
  it('folds Turkish and German letters the same on every system', () => {
    expect(foldLetters('İPHONE Kılıfı Straße')).toBe('iphone kilifi strasse');
    expect(foldLetters('t-shirt')).toBe('t-shirt');
  });
});
