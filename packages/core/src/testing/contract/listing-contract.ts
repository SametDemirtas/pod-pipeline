import { describe, expect, it } from 'vitest';
import { productFamilyId } from '../../catalog/product-family.js';
import { ValidationError } from '../../errors.js';
import type { ContractStore } from './contract-store.js';

const mug = productFamilyId('mug');
const blanket = productFamilyId('blanket');

const keysOf = (items: readonly { designKey: string }[]) => items.map((item) => item.designKey);

export function describeListingContract(store: ContractStore): void {
  describe('listing', () => {
    describePages(store);
    describeCursorsAndFilters(store);
    describeSearch(store);
    describeSearchText(store);
  });
}

/** Pages in catalog order. */
function describePages(store: ContractStore): void {
  it('orders by concept number, then design key, and reports the total', async () => {
    await store.seed(['100-mug', '99-mug', '02-mug', '01-blanket', '01-mug', '10-phone-case']);

    const page = await store.current.query.listDesigns({}, { limit: 10 });

    expect(keysOf(page.items)).toEqual([
      '01-blanket',
      '01-mug',
      '02-mug',
      '10-phone-case',
      '99-mug',
      '100-mug',
    ]);
    expect(page.total).toBe(6);
    expect(page.nextCursor).toBeNull();
  });

  it('walks every page exactly once', async () => {
    const keys = [
      '01-blanket',
      '01-mug',
      '01-phone-case',
      '02-blanket',
      '02-mug',
      '02-tote-bag',
      '03-phone-case',
      '100-phone-case',
    ];
    await store.seed(keys);

    for (const limit of [1, 2, 3, 7, 8, 50]) expect(await store.collect(limit)).toEqual(keys);
  });

  it('returns no cursor on an exactly full last page', async () => {
    await store.seed(['01-phone-case', '01-mug']);

    const page = await store.current.query.listDesigns({}, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page for an empty catalog', async () => {
    expect(await store.current.query.listDesigns({}, { limit: 5 })).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
  });
}

/** Cursors that stay valid, and filters by family. */
function describeCursorsAndFilters(store: ContractStore): void {
  it('never repeats a design; ones added before the cursor show on a new walk', async () => {
    await store.seed(['01-mug', '03-mug', '05-mug']);
    const first = await store.current.query.listDesigns({}, { limit: 2 });
    await store.seed(['00-mug', '02-mug', '04-mug']);

    const cursor = first.nextCursor ?? undefined;
    const second = await store.current.query.listDesigns({}, { limit: 10, cursor });

    expect(keysOf(first.items)).toEqual(['01-mug', '03-mug']);
    expect(keysOf(second.items)).toEqual(['04-mug', '05-mug']);
    expect(second.total).toBe(6);
    expect(await store.collect(10)).toEqual([
      '00-mug',
      '01-mug',
      '02-mug',
      '03-mug',
      '04-mug',
      '05-mug',
    ]);
  });

  it('filters by product family across pages', async () => {
    await store.seed(['01-mug', '01-blanket', '02-mug', '02-blanket', '03-blanket']);

    expect(await store.collect(1, { familyId: blanket })).toEqual([
      '01-blanket',
      '02-blanket',
      '03-blanket',
    ]);
    const page = await store.current.query.listDesigns({ familyId: mug }, { limit: 1 });
    expect(page.total).toBe(2);
  });

  it('continues after a cursor taken from a differently filtered list', async () => {
    await store.seed(['01-mug', '01-blanket', '02-mug', '02-blanket']);
    const unfiltered = await store.current.query.listDesigns({}, { limit: 2 });

    const blankets = await store.current.query.listDesigns(
      { familyId: blanket },
      { limit: 10, cursor: unfiltered.nextCursor ?? undefined },
    );

    expect(keysOf(blankets.items)).toEqual(['02-blanket']);
  });
}

/** Search by design key and concept name. */
function describeSearch(store: ContractStore): void {
  it('searches design keys and concept names', async () => {
    await store.seed(['01-mug', '02-mug', '03-mug', '03-blanket'], {
      '01': 'Lantern Harbor',
      '02': 'Frost Garden',
      '03': 'Harbor Lights',
    });

    expect(await store.collect(1, { search: 'harbor' })).toEqual([
      '01-mug',
      '03-blanket',
      '03-mug',
    ]);
    expect(await store.collect(10, { search: '02-mug' })).toEqual(['02-mug']);
    expect(await store.collect(10, { search: 'HARBOR', familyId: blanket })).toEqual([
      '03-blanket',
    ]);
    expect(await store.collect(10, { search: 'nothing' })).toEqual([]);
    const page = await store.current.query.listDesigns({ search: 'harbor' }, { limit: 1 });
    expect(page.total).toBe(3);
  });

  it('counts a design once when both its key and name match', async () => {
    await store.seed(['01-mug'], { '01': 'Collection 01-mug' });

    const page = await store.current.query.listDesigns({ search: '01-mug' }, { limit: 10 });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('ignores case and accents in Turkish and German names', async () => {
    await store.seed(['01-mug', '02-mug', '03-mug'], {
      '01': 'Kırağı Bahçesi',
      '02': 'Große Tasse',
      '03': 'İstanbul Nights',
    });

    expect(await store.collect(10, { search: 'KIRAĞI' })).toEqual(['01-mug']);
    expect(await store.collect(10, { search: 'kiragi bahcesi' })).toEqual(['01-mug']);
    expect(await store.collect(10, { search: 'grosse' })).toEqual(['02-mug']);
    expect(await store.collect(10, { search: 'istanbul' })).toEqual(['03-mug']);
    expect(await store.collect(10, { search: 'ISTANBUL' })).toEqual(['03-mug']);
  });

  it('reads a hyphen as a space on both sides', async () => {
    await store.seed(['01-t-shirt', '02-mug'], { '02': 'Snow-White Forest' });

    expect(await store.collect(10, { search: 't shirt' })).toEqual(['01-t-shirt']);
    expect(await store.collect(10, { search: 'snow white' })).toEqual(['02-mug']);
    expect(await store.collect(10, { search: 'Snow-White' })).toEqual(['02-mug']);
  });
}

/** Search text taken literally. */
function describeSearchText(store: ContractStore): void {
  it('finds an unnamed concept by its design key', async () => {
    await store.seed(['01-mug'], { '01': null });

    expect(await store.collect(10, { search: '01-mug' })).toEqual(['01-mug']);
    expect(await store.collect(10, { search: 'concept' })).toEqual([]);
  });

  it('treats wildcard and escape characters as plain text', async () => {
    await store.seed(['01-mug', '02-mug', '03-mug'], {
      '01': '100% Cozy',
      '02': 'Cozy_Nights',
      '03': 'Back\\Slash',
    });

    expect(await store.collect(10, { search: '%' })).toEqual(['01-mug']);
    expect(await store.collect(10, { search: '_' })).toEqual(['02-mug']);
    expect(await store.collect(10, { search: '\\' })).toEqual(['03-mug']);
  });

  it.each([
    'not-a-cursor',
    '["01-mug"]',
    '[1,2]',
    '{}',
    'eyJ4IjoxfQ',
    '{"after":""}',
    '{"after":"x"}',
  ])('rejects the malformed cursor %j', async (cursor) => {
    await store.seed(['01-mug']);

    await expect(store.current.query.listDesigns({}, { limit: 1, cursor })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
}
