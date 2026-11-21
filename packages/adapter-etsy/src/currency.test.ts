import { describe, expect, it } from 'vitest';
import { minorDigits } from './currency.js';

describe('minorDigits', () => {
  it.each([
    ['USD', 2],
    ['JPY', 0],
    ['KWD', 3],
  ])('gives %s %i decimal places', (currency, digits) => {
    expect(minorDigits(currency)).toBe(digits);
  });
});
