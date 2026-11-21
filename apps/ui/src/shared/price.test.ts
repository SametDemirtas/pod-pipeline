import { describe, expect, it } from 'vitest';
import { parsePrice, priceExample, priceRange, typedPrices, wrongPrices } from './price.js';

describe('parsePrice', () => {
  it.each([
    ['2500', 0, 2500],
    ['24.99', 0, null],
    ['24.99', 2, 2499],
    ['24,99', 2, 2499],
    ['24.5', 2, 2450],
    [' 7 ', 2, 700],
    ['24.999', 2, null],
    ['1,000', 2, null],
    ['1.234', 3, 1234],
    ['7.25', 3, 7250],
    ['', 2, null],
    ['-1', 2, null],
  ] as const)('reads %j with %i decimals as %j', (text, digits, price) => {
    expect(parsePrice(text, digits)).toBe(price);
  });
});

describe('priceExample', () => {
  it.each([
    ['en', 2, '24.99'],
    ['de', 2, '24,99'],
    ['tr', 2, '24,99'],
    ['en', 0, '2499'],
    ['en', 3, '2.499'],
  ] as const)('writes the example in %s with %i decimals as %s', (locale, digits, example) => {
    expect(priceExample(digits, locale)).toBe(example);
  });

  it('reads back as the same amount', () => {
    for (const digits of [0, 2, 3]) {
      expect(parsePrice(priceExample(digits, 'de'), digits)).toBe(2499);
    }
  });
});

describe('priceRange', () => {
  it("knows Etsy's range only for shops selling in US dollars", () => {
    expect(priceRange({ currency: 'USD', currencyDigits: 2 })).toEqual({ min: 20, max: 5_000_000 });
    expect(priceRange({ currency: 'EUR', currencyDigits: 2 })).toBeNull();
  });
});

describe('typed prices', () => {
  const usd = { currency: 'USD', currencyDigits: 2 };

  it('writes saved prices in the shop currency and leaves others to type again', () => {
    expect(
      typedPrices(
        { mug: { amount: 1899, currency: 'USD' }, blanket: { amount: 4500, currency: 'EUR' } },
        usd,
        'de',
      ),
    ).toEqual({ mug: '18,99' });
  });

  it('names the keys whose filled-in price Etsy would refuse', () => {
    expect(wrongPrices(['a', 'b', 'c', 'd'], { a: '0', b: '', c: '5', d: 'x' }, usd)).toEqual([
      'a',
      'd',
    ]);
  });
});
