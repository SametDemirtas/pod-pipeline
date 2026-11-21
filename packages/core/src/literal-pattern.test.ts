import { describe, expect, it } from 'vitest';
import { literalPattern } from './literal-pattern.js';

describe('literalPattern', () => {
  it('matches the text as written, special characters included', () => {
    const pattern = new RegExp(literalPattern('Dr. Who (2005) $5+'));

    expect(pattern.test('fan of Dr. Who (2005) $5+ mugs')).toBe(true);
    expect(pattern.test('Drx Who 2005 5')).toBe(false);
  });
});
