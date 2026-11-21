import { describe, expect, it } from 'vitest';
import { type PrintVariantDto } from '@pod/contracts/client';
import { choosesByColor } from '@pod/rules';
import { colorsOf, sizesOf, variantFor } from './variant-options.js';

function variant(id: string, color: string | null, size: string | null): PrintVariantDto {
  return { id, name: id, color, size, areas: [] };
}

const shirts = [
  variant('1', 'Aqua', '2XL'),
  variant('2', 'Aqua', 'L'),
  variant('3', 'Aqua', 'M'),
  variant('4', 'Aqua', 'S'),
  variant('5', 'Black', 'M'),
  variant('6', 'Black', 'XL'),
];

describe('variant options', () => {
  it('chooses by colour only when every variant has one and there are several', () => {
    expect(choosesByColor(shirts)).toBe(true);
    expect(choosesByColor([variant('1', 'White', '11 oz'), variant('2', 'White', '15 oz')])).toBe(
      false,
    );
    expect(choosesByColor([variant('1', 'Black', 'M'), variant('2', null, 'L')])).toBe(false);
    expect(choosesByColor([variant('1', 'Black', 'M'), variant('2', 'White', null)])).toBe(false);
    expect(
      choosesByColor([
        variant('1', 'Black', 'M'),
        variant('2', 'Black', 'M'),
        variant('3', 'Red', 'M'),
      ]),
    ).toBe(false);
  });

  it('lists colours once, in the order Printful gives them', () => {
    expect(colorsOf([...shirts, variant('7', null, null)])).toEqual(['Aqua', 'Black']);
  });

  it('puts clothing sizes from small to large and leaves other sizes as listed', () => {
    expect(sizesOf(shirts, 'Aqua')).toEqual(['S', 'M', 'L', '2XL']);
    const cases = [variant('1', 'Glossy', 'iPhone 15'), variant('2', 'Glossy', 'iPhone 13')];
    expect(sizesOf(cases, 'Glossy')).toEqual(['iPhone 15', 'iPhone 13']);
  });

  it('keeps the size when the new colour has it and takes the first otherwise', () => {
    expect(variantFor(shirts, 'Black', 'M')?.id).toBe('5');
    expect(variantFor(shirts, 'Black', 'S')?.id).toBe('5');
    expect(variantFor(shirts, 'Red', 'S')).toBeUndefined();
  });
});
