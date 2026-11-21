import { describe, expect, it } from 'vitest';
import { fulfilmentStoreProblem } from './fulfilment-store.js';

const store = { name: 'MapleLaneStore', syncsWithMarketplace: true, shopHandle: null };

describe('fulfilmentStoreProblem', () => {
  it('finds a store that syncs with no Etsy shop, whatever its name', () => {
    expect(
      fulfilmentStoreProblem({ ...store, syncsWithMarketplace: false }, 'MapleLaneStore'),
    ).toBe('not-marketplace');
    expect(fulfilmentStoreProblem({ ...store, syncsWithMarketplace: false }, undefined)).toBe(
      'not-marketplace',
    );
  });

  it('takes an Etsy store named like the shop, or at the shop’s address, as the right one', () => {
    expect(fulfilmentStoreProblem(store, 'MapleLaneStore')).toBeNull();
    expect(
      fulfilmentStoreProblem({ ...store, name: 'maple-lane store' }, 'MapleLaneStore'),
    ).toBeNull();
    expect(
      fulfilmentStoreProblem(
        { ...store, name: 'My Etsy', shopHandle: 'maplelanestore' },
        'MapleLaneStore',
      ),
    ).toBeNull();
    expect(fulfilmentStoreProblem({ ...store, name: 'Renamed' }, ' ')).toBeNull();
  });

  it('finds an Etsy store that looks like another shop’s', () => {
    expect(fulfilmentStoreProblem({ ...store, name: 'Maple Lane' }, 'MapleLaneStore')).toBe(
      'other-shop',
    );
  });

  it('tells nothing when Printful did not say what the store is, or Etsy is not connected', () => {
    expect(fulfilmentStoreProblem({ ...store, syncsWithMarketplace: null }, 'Other')).toBeNull();
    expect(fulfilmentStoreProblem({ ...store, name: 'Other' }, undefined)).toBeNull();
  });
});
