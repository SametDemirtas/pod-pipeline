import { describe, expect, it } from 'vitest';
import { brandsNamedIn } from './family-brands.js';

describe('family brands', () => {
  it.each([
    'Case for SAMSUNG Galaxy S25',
    'SamsungGalaxy S24 case',
    'samsungs and more',
    'samsungcase',
    '#samsungcases',
  ])('finds Samsung in %j', (text) => {
    expect(brandsNamedIn(text, ['Samsung'])).toEqual(['Samsung']);
  });

  it.each([
    'Fits iPhone 17 Pro',
    'iPhone17 case',
    'iPhone17Pro',
    'for iPhones',
    '#iphonecase',
    'iphonecases gift',
    'İPHONE KILIFI',
  ])('finds iPhone in %j', (text) => {
    expect(brandsNamedIn(text, ['iPhone'])).toEqual(['iPhone']);
  });

  it.each([
    ['Samsungish colours', 'Samsung'],
    ['MyiPhone', 'iPhone'],
    ['Galaxy night sky', 'Samsung'],
    ['Apple orchard', 'iPhone'],
  ])('leaves %j alone', (text, brand) => {
    expect(brandsNamedIn(text, [brand])).toEqual([]);
  });

  it('takes a brand as plain text, not a pattern', () => {
    expect(brandsNamedIn('a+b case', ['a+b'])).toEqual(['a+b']);
    expect(brandsNamedIn('aab case', ['a+b'])).toEqual([]);
  });
});
