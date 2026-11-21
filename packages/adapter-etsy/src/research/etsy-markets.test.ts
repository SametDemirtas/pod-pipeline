import { describe, expect, it } from 'vitest';
import { searchUrl } from './etsy-markets.js';

describe('Etsy markets', () => {
  it('search each market under its own path', () => {
    expect((['US', 'GB', 'DE'] as const).map((region) => searchUrl('cat mug', region))).toEqual([
      'https://www.etsy.com/search?q=cat%20mug',
      'https://www.etsy.com/uk/search?q=cat%20mug',
      'https://www.etsy.com/de/search?q=cat%20mug',
    ]);
  });
});
