import { describe, expect, it } from 'vitest';
import { missingPricesOf, recentRun, shippingOf } from './batch-estimate.js';

describe('recentRun', () => {
  it('reuses a search for the same words and market from the last 30 days', () => {
    const run = (id: string, market: 'US' | 'DE', createdAt: string) => ({
      id,
      query: 'meadow bees mug',
      market,
      createdAt,
      resultsLabel: null,
      topTerms: [],
    });
    const runs = [
      run('de', 'DE', '2026-10-27T00:00:00.000Z'),
      run('old', 'US', '2026-09-01T00:00:00.000Z'),
      run('us', 'US', '2026-10-20T00:00:00.000Z'),
    ];
    const now = new Date('2026-10-28T00:00:00.000Z');

    expect(recentRun(runs, 'meadow bees mug', 'US', now)?.id).toBe('us');
    expect(recentRun(runs.slice(0, 2), 'meadow bees mug', 'US', now)).toBeUndefined();
    expect(recentRun(runs, 'tulip mug', 'US', now)).toBeUndefined();
  });
});

describe('batch estimate rules', () => {
  const usd = (amount: number) => ({ amount, currency: 'USD' });

  it('names each product once with the sizes that lack a price', () => {
    const settings = {
      listingSizes: { blanket: ['50″×60″', '60″×80″'] },
      listingPrices: { mug: usd(1599) },
      sizePrices: { blanket: { '60″×80″': usd(7499) } },
    };

    expect(missingPricesOf(settings, 'USD', ['mug', 'blanket', 'blanket'])).toEqual([
      { familyId: 'blanket', sizes: ['50″×60″'] },
    ]);
    expect(missingPricesOf(settings, 'EUR', ['mug'])).toEqual([{ familyId: 'mug', sizes: [] }]);
  });

  it('tells a shop without any shipping profile apart from a chosen one that left', () => {
    const shop = { shippingProfiles: [{ id: '316', label: 'Free everywhere' }] };

    expect(shippingOf(shop, { mug: 'gone' }, ['mug', 'blanket', 'mug'])).toEqual([
      { familyId: 'mug', profile: null, missing: 'gone' },
      { familyId: 'blanket', profile: 'Free everywhere', missing: null },
    ]);
    expect(shippingOf({ shippingProfiles: [] }, {}, ['mug'])).toEqual([
      { familyId: 'mug', profile: null, missing: 'none' },
    ]);
  });
});
