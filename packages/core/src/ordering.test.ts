import { describe, expect, it } from 'vitest';
import { compareCodeUnits, compareDesignKeys, conceptNumberOf } from './ordering.js';

describe('ordering', () => {
  it('compares by code unit regardless of locale', () => {
    expect(['b', 'a', 'B', 'ä', 'A'].sort(compareCodeUnits)).toEqual(['A', 'B', 'a', 'b', 'ä']);
    expect(compareCodeUnits('x', 'x')).toBe(0);
  });

  it.each([
    ['07-mug', 7],
    ['7-mug', 7],
    ['100-tote-bag', 100],
    ['mug', 0],
  ])('reads concept number of %s as %d', (key, number) => {
    expect(conceptNumberOf(key)).toBe(number);
  });

  it('orders by concept number, so 99-mug comes before 100-mug', () => {
    expect(['100-mug', '11-mug', '99-mug', '01-mug'].sort(compareDesignKeys)).toEqual([
      '01-mug',
      '11-mug',
      '99-mug',
      '100-mug',
    ]);
  });

  it('orders the products of one concept alphabetically by family id', () => {
    const keys = ['01-tote-bag', '01-mug', '01-t-shirt', '01-blanket', '01-phone-case'];

    expect(keys.sort(compareDesignKeys)).toEqual([
      '01-blanket',
      '01-mug',
      '01-phone-case',
      '01-t-shirt',
      '01-tote-bag',
    ]);
  });
});
