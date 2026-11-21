import { describe, expect, it, vi } from 'vitest';
import { FakePrintCatalog, FakePrintSync } from '@pod/core/testing';
import { sampleListing } from '@pod/core/testing/contract';
import { partsIn, savedDesign, settingsOf, usePartsFolder } from '../testing/parts-setup.js';
import { createListingService } from './listing-providers.js';

/** Etsy renewing the sign-in with a new refresh token, and a shop that sells in dollars. */
const etsyFetch: typeof fetch = (input) => {
  const url = input instanceof Request ? input.url : input.toString();
  const body = url.includes('/oauth/token')
    ? { access_token: 'a', refresh_token: 'refresh-2', expires_in: 3600 }
    : { shop_name: 'MeadowBees', currency_code: 'USD', results: [] };
  return Promise.resolve(new Response(JSON.stringify(body)));
};

describe('createListingService', () => {
  const folder = usePartsFolder();

  it('reports an Etsy sign-in it could not save as unsaved, and logs why', async () => {
    const logError = vi.fn<(error: unknown) => void>();
    const parts = await partsIn(folder, { fetch: etsyFetch, logError });
    await parts.secrets.signIns.etsy.save({
      keystring: 'key',
      sharedSecret: 'secret',
      refreshToken: 'refresh-1',
      shopId: '10001001',
      shopName: 'MeadowBees',
    });
    const diskFull = new Error('disk full');
    vi.spyOn(parts.secrets.signIns.etsy, 'rotateRefreshToken').mockRejectedValue(diskFull);

    await createListingService(parts, settingsOf(parts, 'en'))
      .getShopOptions()
      .catch(() => undefined);

    expect(parts.secrets.unsavedSignIns.list()).toEqual(['etsy']);
    expect(logError).toHaveBeenCalledWith(diskFull);
  });

  describe('linking a listing Printful has not imported', () => {
    /** A mug drafted on Etsy, with a Printful store that holds none of its products. */
    async function unsyncedMug() {
      const real = await partsIn(folder);
      const print = {
        ...real.print,
        printCatalog: new FakePrintCatalog(),
        printSync: new FakePrintSync(),
      };
      const parts = { ...real, print };
      const design = await savedDesign(parts, '01-mug');
      await parts.listings.save(sampleListing(design.id));
      return { parts, design };
    }

    it('says the Printful store belongs to another shop when the connections find so', async () => {
      const { parts, design } = await unsyncedMug();
      const fulfilmentStoreMismatch = () =>
        Promise.resolve({
          problem: 'other-shop' as const,
          storeName: 'Lantern Harbor Prints',
          shopName: 'MeadowBees',
        });
      const listings = createListingService(parts, settingsOf(parts, 'en'), {
        fulfilmentStoreMismatch,
      });

      await expect(listings.linkListing({ id: design.id })).rejects.toMatchObject({
        code: 'PRINTFUL_STORE_OTHER_SHOP',
        details: { store: 'Lantern Harbor Prints', shop: 'MeadowBees' },
      });
    });

    it('says only that the listing is not imported yet without the connections', async () => {
      const { parts, design } = await unsyncedMug();
      const listings = createListingService(parts, settingsOf(parts, 'en'));

      await expect(listings.linkListing({ id: design.id })).rejects.toMatchObject({
        code: 'LISTING_NOT_SYNCED',
      });
    });
  });
});
