import { describe, expect, it } from 'vitest';
import { inchesAndCentimetres, withListedSizes } from './dimensions.js';

const facts = { material: 'Polyester', care: '', fit: '', size: 'Seller words' };

describe('listed sizes', () => {
  it('give inches with centimetres', () => {
    expect(inchesAndCentimetres('50″×60″')).toBe('50″×60″ (127 × 152 cm)');
    expect(inchesAndCentimetres('60" x 80"')).toBe('60" x 80" (152 × 203 cm)');
    expect(inchesAndCentimetres('11 oz')).toBeUndefined();
  });

  it('state exactly the sizes a listing sells, and leave other products alone', () => {
    expect(withListedSizes(facts, ['50″×60″']).size).toBe('50″×60″ (127 × 152 cm)');
    expect(withListedSizes(facts, ['50″×60″', '60″×80″']).size).toBe(
      '50″×60″ (127 × 152 cm), 60″×80″ (152 × 203 cm)',
    );
    expect(withListedSizes(facts, ['11 oz', '15 oz'])).toBe(facts);
    expect(withListedSizes(facts, [])).toBe(facts);
  });
});
