import { beforeEach, describe, expect, it } from 'vitest';
import { ListingExistsError, NotFoundError, ValidationError } from '../errors.js';
import type { PrintVariant } from '../print/print-product.js';
import { SAMPLE_SHIRT, type FakeMarketplace } from '../testing/index.js';
import { draftInput as input, listingDraftFixture } from '../testing/listing-draft-fixture.js';
import type { CreateListingDraft, CreateListingDraftInput } from './create-listing-draft.js';

describe('CreateListingDraft input', () => {
  let marketplace: FakeMarketplace;
  let create: CreateListingDraft;

  beforeEach(async () => {
    ({ create, marketplace } = await listingDraftFixture());
  });

  it('refuses a language listed twice', async () => {
    const twice = { language: 'de', text: { title: 'T', description: 'D', tags: [] } };

    await expect(create.execute(input({ translations: [twice, twice] }))).rejects.toThrow(
      /lists a language twice/,
    );
    expect(marketplace.drafts.size).toBe(0);
  });

  it("refuses a translation into the listing's own language", async () => {
    const english = { language: 'en-GB', text: { title: 'T', description: 'D', tags: [] } };

    await expect(create.execute(input({ translations: [english] }))).rejects.toThrow(
      /repeat the listing's own language en-US/,
    );
    expect(marketplace.drafts.size).toBe(0);
  });

  it('refuses translations into more than ten languages', async () => {
    const translations = Array.from({ length: 11 }, (_, i) => ({
      language: `l${i}`,
      text: { title: 'T', description: 'D', tags: [] },
    }));

    await expect(create.execute(input({ translations }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('makes one listing per design', async () => {
    await create.execute(input());

    await expect(create.execute(input())).rejects.toBeInstanceOf(ListingExistsError);
    expect(marketplace.drafts.size).toBe(1);
  });

  it.each<[string, Partial<CreateListingDraftInput>]>([
    ['a price of zero', { price: 0 }],
    ['a price with fractions', { price: 24.99 }],
    ['a negative size price', { sizePrices: { L: -5 } }],
    ['a price for a size no chosen variant has', { sizePrices: { '2xl': 2500 } }],
    ['no variants', { variantIds: [] }],
    ['a variant twice', { variantIds: ['4000', '4000'] }],
    ['no photos', { mockupIds: [] }],
    ['eleven photos', { mockupIds: Array.from({ length: 11 }, (_, i) => `m${i}`) }],
    ['an empty title', { text: { title: ' ', description: 'x', tags: [] } }],
  ])('rejects %s before asking the marketplace', async (_case, overrides) => {
    await expect(create.execute(input(overrides))).rejects.toBeInstanceOf(ValidationError);
    expect(marketplace.drafts.size).toBe(0);
  });

  it('leaves the price range to the marketplace, as it depends on the currency', async () => {
    // 15 yen is a whole price in a currency without decimals.
    await create.execute(input({ price: 15, sizePrices: { L: 9_000_000 } }));

    expect(marketplace.drafts.size).toBe(1);
  });

  it('refuses a scene whose print the seller has not confirmed', async () => {
    await expect(create.execute(input({ mockupIds: ['m1', 'm4'] }))).rejects.toThrow(
      'confirm the print of scene m4 first',
    );
    expect(marketplace.drafts.size).toBe(0);
  });

  it('refuses a photo of an earlier version of the artwork', async () => {
    await expect(create.execute(input({ mockupIds: ['m1', 'old'] }))).rejects.toThrow(
      'photo old shows an earlier version of the artwork',
    );
    expect(marketplace.drafts.size).toBe(0);
  });

  it('rejects unknown variants and photos before asking the marketplace', async () => {
    await expect(create.execute(input({ variantIds: ['4000', '9'] }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(create.execute(input({ mockupIds: ['m1', 'other'] }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(marketplace.drafts.size).toBe(0);
  });

  it('refuses more options of one variation than Etsy takes, asking Etsy nothing', async () => {
    const sizes = Array.from({ length: 71 }, (_, index) => ({
      ...SAMPLE_SHIRT.variants[0],
      id: String(5000 + index),
      size: `S${String(index)}`,
    })) as PrintVariant[];
    const many = await listingDraftFixture([{ ...SAMPLE_SHIRT, variants: sizes }]);

    await expect(
      many.create.execute(input({ variantIds: sizes.map((variant) => variant.id) })),
    ).rejects.toThrow(/at most 70 options for one variation/);
    expect(many.marketplace.drafts.size).toBe(0);
  });

  it('rejects a variant that cannot be printed on the chosen area', async () => {
    const frontOnly = {
      ...SAMPLE_SHIRT,
      variants: SAMPLE_SHIRT.variants.map((variant, index) =>
        index === 1 ? { ...variant, areas: variant.areas.slice(0, 1) } : variant,
      ),
    };
    const limited = await listingDraftFixture([frontOnly]);

    await expect(limited.create.execute(input({ printArea: 'back' }))).rejects.toThrow(
      /cannot be printed on back/,
    );
  });
});
