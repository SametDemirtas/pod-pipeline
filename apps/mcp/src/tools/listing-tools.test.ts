import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { connect, fakeApi, listing, text } from '../testing/fake-catalog-api.js';

describe('listing tools', () => {
  it('maps listing tools to API requests', async () => {
    const api = fakeApi();
    const client = await connect(api);

    const options = await client.callTool({ name: 'get_shop_options', arguments: {} });
    const none = await client.callTool({ name: 'get_listing', arguments: { design_id: 'd1' } });
    const draft = await client.callTool({
      name: 'create_etsy_draft',
      arguments: {
        design_id: 'd1',
        fit: 'contain',
        language: 'en-US',
        title: 'Tulip Mug',
        description: 'Spooky.',
        tags: ['tulip mug'],
        price: 1999,
        currency: 'USD',
        variant_ids: ['1320'],
        mockup_ids: ['m1'],
        shipping_profile_id: '316',
        readiness_state_id: '151',
        production_partner_ids: [],
      },
    });
    const linked = await client.callTool({ name: 'link_printful', arguments: { design_id: 'd1' } });
    const refreshed = await client.callTool({
      name: 'refresh_listing',
      arguments: { design_id: 'd1' },
    });
    expect(refreshed.structuredContent).toEqual({ listing: null });

    expect(options.structuredContent).toMatchObject({ currency: 'USD' });
    expect(none.structuredContent).toEqual({ listing: null });
    expect(api.createListing).toHaveBeenCalledWith({
      designId: 'd1',
      printArea: undefined,
      fit: 'contain',
      language: 'en-US',
      title: 'Tulip Mug',
      description: 'Spooky.',
      tags: ['tulip mug'],
      price: 1999,
      currency: 'USD',
      sizePrices: undefined,
      variantIds: ['1320'],
      mockupIds: ['m1'],
      shippingProfileId: '316',
      readinessStateId: '151',
      returnPolicyId: undefined,
      productionPartnerIds: [],
      translations: undefined,
    });
    expect(draft.structuredContent).toEqual({
      ...listing,
      trademarks: ['NFL'],
      aiTells: [{ language: 'en', category: 'hype', field: 'title', match: 'Handmade' }],
    });
    expect(api.linkListing).toHaveBeenCalledWith({ id: 'd1' });
    expect(linked.structuredContent).toMatchObject({ linkedAt: '2026-10-24T11:00:00.000Z' });
  });

  it('reads what Etsy and Printful show now, without the small copies meant for the window', async () => {
    const api = fakeApi();
    api.listingPhotos.mockResolvedValueOnce({
      marketplace: [
        { url: 'https://i.etsystatic.com/1.jpg', image: 'data:x', width: 2000, height: 1600 },
      ],
      print: [{ kind: 'default', url: 'https://files.cdn.printful.com/1.png', image: '' }],
    });
    const client = await connect(api);

    const photos = await client.callTool({
      name: 'get_listing_photos',
      arguments: { design_id: 'd1' },
    });
    const pending = await client.callTool({
      name: 'get_listing_photos',
      arguments: { design_id: 'd1' },
    });

    expect(api.listingPhotos).toHaveBeenCalledWith({ id: 'd1' });
    expect(photos.structuredContent).toEqual({
      marketplace: [{ url: 'https://i.etsystatic.com/1.jpg', width: 2000, height: 1600 }],
      print: [{ kind: 'default', url: 'https://files.cdn.printful.com/1.png' }],
    });
    expect(pending.structuredContent).toEqual({ marketplace: [], print: null });
  });

  it("replaces the draft's photos, and explains a listing that is no draft", async () => {
    const api = fakeApi();
    const client = await connect(api);

    const replaced = await client.callTool({
      name: 'replace_etsy_draft_photos',
      arguments: { design_id: 'd1', mockup_ids: ['m2', 'm1'] },
    });
    api.replaceListingPhotos.mockRejectedValueOnce(
      new ApiError({ code: 'LISTING_NOT_DRAFT', message: 'active', details: { state: 'active' } }),
    );
    const refused = await client.callTool({
      name: 'replace_etsy_draft_photos',
      arguments: { design_id: 'd1', mockup_ids: ['m1'] },
    });

    expect(api.replaceListingPhotos).toHaveBeenCalledWith({
      designId: 'd1',
      mockupIds: ['m2', 'm1'],
    });
    expect(replaced.structuredContent).toEqual(listing);
    expect(refused.isError).toBe(true);
    expect(text(refused)).toContain('only replaced while it is a draft');
  });

  it('explains what to do when Printful has not imported the listing', async () => {
    const api = fakeApi();
    api.linkListing.mockRejectedValueOnce(
      new ApiError({ code: 'LISTING_NOT_SYNCED', message: 'not imported', details: {} }),
    );

    const result = await (
      await connect(api)
    ).callTool({
      name: 'link_printful',
      arguments: { design_id: 'd1' },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/store sync is on/);
  });
});
