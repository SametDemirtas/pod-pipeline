import { describe, expect, it } from 'vitest';
import type { ListingDto } from '@pod/contracts';
import { designDto, mockupDto, shopOptionsDto } from '../../../testing/batch-fixtures.js';
import { PREPARED, item, setUp } from '../../../testing/batch-steps-setup.js';

describe('draft step', () => {
  it("creates an unpublished draft with the family's price and the shop's first options", async () => {
    const { catalog, run } = setUp();
    catalog.listMockups.mockResolvedValue([
      mockupDto('m1'),
      mockupDto('scene', { scenePrompt: 'A table', printConfirmed: true }),
      mockupDto('m2', { view: 'left' }),
    ]);

    expect(await run('draft', item({ text: PREPARED }))).toEqual({ state: 'done' });
    expect(catalog.createListing).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      printArea: 'default',
      fit: 'contain',
      language: 'en-US',
      title: 'Meadow Bees Mug',
      description: 'A mug.',
      tags: ['fall mug'],
      price: 1899,
      currency: 'USD',
      variantIds: ['1320', '4830'],
      mockupIds: ['m1', 'm2'],
      shippingProfileId: '316',
      readinessStateId: '151',
      returnPolicyId: '1518',
      productionPartnerIds: ['77'],
      translations: [{ language: 'de', title: 'Tasse', description: 'Eine.', tags: [] }],
    });
  });

  it('skips a design with a listing and stops one without a price or shop setup', async () => {
    const { catalog, run } = setUp({ listingPrices: {} });
    const prepared = item({ text: PREPARED });

    await expect(run('draft', prepared)).rejects.toMatchObject({
      code: 'LISTING_PRICE_MISSING',
      details: { familyId: 'mug' },
    });
    catalog.getListing.mockResolvedValue({} as ListingDto);
    expect(await run('draft', prepared)).toEqual({ state: 'skipped' });
    expect(catalog.createListing).not.toHaveBeenCalled();
  });

  it('uses the shipping profile chosen for the product, and stops when it left the shop', async () => {
    const { catalog, run } = setUp({
      listingPrices: { mug: { amount: 1899, currency: 'USD' } },
      shippingProfiles: { mug: '412' },
    });
    catalog.listMockups.mockResolvedValue([mockupDto('m1')]);
    catalog.getShopOptions.mockResolvedValue(
      shopOptionsDto({
        shippingProfiles: [
          { id: '316', label: 'Free everywhere' },
          { id: '412', label: 'Free US' },
        ],
      }),
    );

    await run('draft', item({ text: PREPARED }));
    expect(catalog.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ shippingProfileId: '412' }),
    );

    catalog.getShopOptions.mockResolvedValue(shopOptionsDto());
    await expect(run('draft', item({ text: PREPARED }))).rejects.toMatchObject({
      code: 'SHIPPING_PROFILE_GONE',
    });
  });

  it('stops when the design was imported again after its text was written', async () => {
    const { catalog, run } = setUp();
    catalog.getDesign.mockResolvedValue({ ...designDto('01-mug'), revision: 2 });

    await expect(run('draft', item({ text: PREPARED }))).rejects.toMatchObject({
      code: 'BATCH_DESIGN_CHANGED',
      details: { designKey: '01-mug' },
    });
    expect(catalog.createListing).not.toHaveBeenCalled();
  });

  it('drafts the text once the artwork was only made larger or turned in the window since', async () => {
    const { catalog, run } = setUp();
    const revision = (number: number, upscaleModel: 'photo' | null) => ({
      ...designDto('01-mug'),
      revision: number,
      upscaleModel,
      recordedAt: '2026-10-02T10:00:00.000Z',
    });
    catalog.getDesign.mockResolvedValue({
      ...designDto('01-mug'),
      revision: 2,
      upscaleModel: 'photo',
      revisions: [revision(2, 'photo'), revision(1, null)],
    });

    expect(await run('draft', item({ text: PREPARED }))).toEqual({ state: 'done' });
    expect(catalog.createListing).toHaveBeenCalledOnce();
  });

  it('skips a design whose listing the window made while the step waited', async () => {
    const { catalog, run } = setUp();
    catalog.getListing.mockResolvedValueOnce(null).mockResolvedValueOnce({} as ListingDto);

    expect(await run('draft', item({ text: PREPARED }))).toEqual({ state: 'skipped' });
    expect(catalog.createListing).not.toHaveBeenCalled();
  });

  it('stops for a price in another currency, a shop not set up, or missing text', async () => {
    const { catalog, run } = setUp();
    const prepared = item({ text: PREPARED });

    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ currency: 'EUR' }));
    await expect(run('draft', prepared)).rejects.toMatchObject({ code: 'SHOP_CURRENCY_CHANGED' });
    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ shippingProfiles: [] }));
    await expect(run('draft', prepared)).rejects.toMatchObject({ code: 'SHOP_SETUP_MISSING' });
    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ returnPolicies: [] }));
    await run('draft', prepared);
    expect(catalog.createListing.mock.lastCall?.[0]).not.toHaveProperty('returnPolicyId');
    await expect(run('draft')).rejects.toThrow(/No listing text/);
  });
});
