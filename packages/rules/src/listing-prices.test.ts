import { describe, expect, it } from 'vitest';
import { isPriceGap, listedPrices } from './listing-prices.js';

const usd = (amount: number) => ({ amount, currency: 'USD' });
const SMALL = '50″×60″';
const LARGE = '60″×80″';

describe('listedPrices', () => {
  it("takes each size's own price and the family's for the others", () => {
    const settings = {
      listingPrices: { blanket: usd(5499) },
      sizePrices: { blanket: { [LARGE]: usd(7499) } },
    };

    expect(listedPrices(settings, 'blanket', 'USD', [SMALL, LARGE])).toEqual({
      price: 5499,
      sizePrices: { [LARGE]: 7499 },
    });
    expect(listedPrices(settings, 'blanket', 'USD', [SMALL])).toEqual({
      price: 5499,
      sizePrices: {},
    });
  });

  it('needs no family price when every size listed has its own', () => {
    const settings = {
      listingPrices: {},
      sizePrices: { blanket: { [SMALL]: usd(5499), [LARGE]: usd(7499) } },
    };

    expect(listedPrices(settings, 'blanket', 'USD', [SMALL, LARGE])).toEqual({
      price: 5499,
      sizePrices: { [SMALL]: 5499, [LARGE]: 7499 },
    });
  });

  it('names the product and the sizes without a price, and finds prices in another currency', () => {
    const sized = { listingPrices: {}, sizePrices: { blanket: { [SMALL]: usd(5499) } } };

    expect(listedPrices(sized, 'blanket', 'USD', [SMALL, LARGE])).toEqual({
      kind: 'missing',
      familyId: 'blanket',
      sizes: [LARGE],
    });
    expect(listedPrices({ listingPrices: {}, sizePrices: {} }, 'mug', 'USD', [null])).toEqual({
      kind: 'missing',
      familyId: 'mug',
      sizes: [],
    });
    const prices = listedPrices(sized, 'blanket', 'EUR', [SMALL]);
    expect(prices).toEqual({ kind: 'currency' });
    expect(isPriceGap(prices)).toBe(true);
  });
});
