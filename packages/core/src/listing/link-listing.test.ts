import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import {
  ListingNotSyncedError,
  NotFoundError,
  PrintFileMissingError,
  PrintProductUnavailableError,
  PrintVariantUnavailableError,
} from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakeFileHost,
  FakePrintCatalog,
  FakePrintSync,
  FixedClock,
  InMemoryCatalog,
  InMemoryListings,
} from '../testing/index.js';
import { productFamilyId } from '../catalog/product-family.js';
import type { MockupOrientationQuery } from '../ports/print-provider.js';
import { LinkListing } from './link-listing.js';
import type { Listing } from './listing.js';

const MUG = 'design-01-mug' as DesignId;

describe('LinkListing', () => {
  let catalog: InMemoryCatalog;
  let listings: InMemoryListings;
  let printSync: FakePrintSync;
  let fileHost: FakeFileHost;
  let link: LinkListing;

  beforeEach(async () => {
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    const first = sampleDesign('01-mug');
    await catalog.designs.save(first);
    await catalog.designs.save({ ...first, revision: 2, asset: { ...first.asset, sha256: 'v2' } });
    await catalog.designs.save(sampleDesign('01-blanket'));
    listings = new InMemoryListings();
    await listings.save(sampleListing(MUG));
    printSync = new FakePrintSync();
    fileHost = new FakeFileHost();
    link = new LinkListing({
      query: catalog,
      printCatalog: new FakePrintCatalog(),
      listings,
      printSync,
      fileHost,
      assets: { pathOf: (key) => `/data/${key}` },
      clock: new FixedClock(),
    });
  });

  it('uploads the print file once and links every product with its own placement', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002', 'someone-else']);

    const linked = await link.execute(MUG);

    expect(printSync.uploads).toEqual([
      { url: 'https://host.test/01-mug-r2.png', name: '01-mug-r2.png' },
    ]);
    expect(fileHost.released).toBe(1);
    expect([...printSync.links]).toEqual([
      [
        'sv-800000001',
        {
          variantId: '1320',
          fileId: 'file-1',
          area: { placement: 'default', width: 2700, height: 1050, dpi: 300 },
          placement: { left: 127, top: 0, width: 2447, height: 1050 },
        },
      ],
      [
        'sv-800000002',
        {
          variantId: '4830',
          fileId: 'file-1',
          area: { placement: 'default', width: 2700, height: 1140, dpi: 300 },
          placement: { left: 22, top: 0, width: 2656, height: 1140 },
        },
      ],
    ]);
    expect(linked).toMatchObject({
      designRevision: 2,
      linkedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(await listings.findByDesign(MUG)).toEqual(linked);
  });

  it('covers each blanket size with its own print area, centred and cropped, never stretched', async () => {
    const blanket = 'design-02-blanket' as DesignId;
    await catalog.concepts.save(sampleConcept('02'));
    const design = sampleDesign('02-blanket');
    await catalog.designs.save({
      ...design,
      asset: { ...design.asset, width: 2560, height: 3200 },
    });
    await listings.save(
      sampleListing(blanket, {
        id: 'listing-blanket' as Listing['id'],
        marketplaceId: '555',
        fit: 'cover',
        products: [
          { sku: 'PF-10986', productId: '900000001', variantId: '10986' },
          { sku: 'PF-13222', productId: '900000002', variantId: '13222' },
        ],
      }),
    );
    const area = (width: number, height: number) => ({
      placement: 'default',
      width,
      height,
      dpi: 150,
    });
    const twoSizes = new LinkListing({
      query: catalog,
      printCatalog: new FakePrintCatalog([
        {
          familyId: productFamilyId('blanket'),
          productId: '395',
          name: 'Throw Blanket',
          variants: [
            {
              id: '13222',
              name: '60×80',
              color: null,
              size: '60″×80″',
              areas: [area(9000, 12000)],
            },
            { id: '10986', name: '50×60', color: null, size: '50″×60″', areas: [area(7500, 9000)] },
          ],
        },
      ]),
      listings,
      printSync,
      fileHost,
      assets: { pathOf: (key) => `/data/${key}` },
      clock: new FixedClock(),
    });
    printSync.importListing('555', ['900000001', '900000002']);

    await twoSizes.execute(blanket);

    // 0.8 artwork on a 0.833 and a 0.75 area: wider than one, taller than the other.
    expect(printSync.links.get('sv-900000001')?.placement).toEqual({
      left: 0,
      top: -187,
      width: 7500,
      height: 9375,
    });
    expect(printSync.links.get('sv-900000002')?.placement).toEqual({
      left: -300,
      top: 0,
      width: 9600,
      height: 12000,
    });
  });

  it('waits for the provider to import every product before sharing the design', async () => {
    await expect(link.execute(MUG)).rejects.toBeInstanceOf(ListingNotSyncedError);
    printSync.importListing('1234567890', ['800000001']);
    await expect(link.execute(MUG)).rejects.toBeInstanceOf(ListingNotSyncedError);

    expect(fileHost.shared).toEqual([]);
  });

  it('stops sharing the design when the upload fails', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002']);
    printSync.uploadPrintFile = () => Promise.reject(new Error('Printful is down'));

    await expect(link.execute(MUG)).rejects.toThrow('Printful is down');
    expect(fileHost.released).toBe(1);
  });

  it('needs a listing and a print product', async () => {
    await expect(link.execute('design-01-blanket')).rejects.toBeInstanceOf(NotFoundError);
    await listings.save(
      sampleListing('design-01-blanket' as DesignId, { id: 'l2' as never, marketplaceId: '2' }),
    );
    await expect(link.execute('design-01-blanket')).rejects.toBeInstanceOf(
      PrintProductUnavailableError,
    );
  });

  it('names the variant whose print area is gone', async () => {
    await listings.save(sampleListing(MUG, { printArea: 'back' }));
    printSync.importListing('1234567890', ['800000001', '800000002']);

    await expect(link.execute(MUG)).rejects.toThrow(/back of variant 1320/);
  });

  it('links nothing when the provider has a variant out of stock', async () => {
    const listing = sampleListing(MUG);
    const [first, second] = listing.products;
    if (!first || !second) throw new Error('the sample listing has two products');
    await listings.save({ ...listing, products: [first, { ...second, variantId: '9999' }] });
    printSync.importListing('1234567890', ['800000001', '800000002']);

    await expect(link.execute(MUG)).rejects.toEqual(new PrintVariantUnavailableError('9999'));
    expect(fileHost.shared).toEqual([]);
    expect(printSync.links.size).toBe(0);
  });

  it('leaves a listing linked to the current revision as it is', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002']);

    const first = await link.execute(MUG);
    const again = await link.execute(MUG);

    expect(again).toEqual(first);
    expect(printSync.uploads).toHaveLength(1);
    expect(fileHost.shared).toHaveLength(1);
  });

  it('reuses the uploaded print file when linking is tried again after a failure', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002']);
    const linkVariant = printSync.linkVariant.bind(printSync);
    let calls = 0;
    printSync.linkVariant = (id, variant) =>
      ++calls === 2 ? Promise.reject(new Error('Printful is down')) : linkVariant(id, variant);

    await expect(link.execute(MUG)).rejects.toThrow('Printful is down');
    const linked = await link.execute(MUG);

    expect(printSync.uploads).toHaveLength(1);
    expect(printSync.links.size).toBe(2);
    expect(linked.linkedAt).not.toBeNull();
  });

  it('links again when asked, reusing the uploaded print file', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002']);
    await link.execute(MUG);
    printSync.links.clear();

    await link.execute(MUG, { again: true });

    expect(printSync.links.size).toBe(2);
    expect(printSync.uploads).toHaveLength(1);
  });

  it('uploads the print file again once the provider says it no longer has it', async () => {
    printSync.importListing('1234567890', ['800000001', '800000002']);
    await link.execute(MUG);
    const linkVariant = printSync.linkVariant.bind(printSync);
    printSync.linkVariant = (id, variant) =>
      variant.fileId === 'file-1'
        ? Promise.reject(new PrintFileMissingError(variant.fileId))
        : linkVariant(id, variant);

    await expect(link.execute(MUG, { again: true })).rejects.toBeInstanceOf(NotFoundError);
    await link.execute(MUG, { again: true });

    expect(printSync.uploads).toHaveLength(2);
    expect(printSync.links.get('sv-800000001')?.fileId).toBe('file-2');
  });

  describe('when the provider takes the print area turned a quarter', () => {
    const blanket = 'design-03-blanket' as DesignId;
    const landscape = { placement: 'default', width: 9000, height: 7500, dpi: 150 };
    let queries: MockupOrientationQuery[];
    let turns: boolean;

    const upright = () =>
      new LinkListing({
        query: catalog,
        printCatalog: new FakePrintCatalog([
          {
            familyId: productFamilyId('blanket'),
            productId: '395',
            name: 'Throw Blanket',
            variants: [
              { id: '10986', name: '50×60', color: null, size: '50″×60″', areas: [landscape] },
            ],
          },
        ]),
        listings,
        printSync,
        fileHost,
        assets: { pathOf: (key) => `/data/${key}` },
        clock: new FixedClock(),
        orientation: {
          supportsOrientation: (query) => {
            queries.push(query);
            return Promise.resolve(turns);
          },
        },
      });

    beforeEach(async () => {
      queries = [];
      turns = true;
      await catalog.concepts.save(sampleConcept('03'));
      const design = sampleDesign('03-blanket');
      await catalog.designs.save({
        ...design,
        asset: { ...design.asset, sha256: 'sha-portrait', width: 2560, height: 3200 },
      });
      await listings.save(
        sampleListing(blanket, {
          id: 'listing-03' as Listing['id'],
          marketplaceId: '777',
          fit: 'cover',
          products: [{ sku: 'PF-10986', productId: '900000003', variantId: '10986' }],
        }),
      );
      printSync.importListing('777', ['900000003']);
    });

    const saveTurned = async () => {
      const design = sampleDesign('03-blanket');
      await catalog.designs.save({
        ...design,
        revision: 2,
        asset: { ...design.asset, sha256: 'sha-turned', width: 3200, height: 2560 },
        rotation: { degrees: 90, originalSha256: 'sha-portrait', reason: 'Upright.' },
      });
    };

    it('prints turned artwork from before the turn, upright on the turned area', async () => {
      await saveTurned();

      const linked = await upright().execute(blanket);

      expect(queries).toEqual([
        { productId: '395', variantId: '10986', placement: 'default', orientation: 'vertical' },
      ]);
      expect(printSync.uploads.map((upload) => upload.name)).toEqual(['03-blanket-r1.png']);
      expect(printSync.links.get('sv-900000003')).toEqual({
        variantId: '10986',
        fileId: 'file-1',
        area: { placement: 'default', width: 7500, height: 9000, dpi: 150 },
        placement: { left: 0, top: -187, width: 7500, height: 9375 },
      });
      expect(linked.designRevision).toBe(2);
    });

    it('prints artwork left unturned upright on the turned area', async () => {
      await upright().execute(blanket);

      expect(printSync.uploads.map((upload) => upload.name)).toEqual(['03-blanket-r1.png']);
      expect(printSync.links.get('sv-900000003')?.area).toMatchObject({
        width: 7500,
        height: 9000,
      });
    });

    it('links the current revision on the area as listed when the provider refuses', async () => {
      await saveTurned();
      turns = false;

      await upright().execute(blanket);

      expect(printSync.uploads.map((upload) => upload.name)).toEqual(['03-blanket-r2.png']);
      expect(printSync.links.get('sv-900000003')?.area).toEqual(landscape);
    });
  });
});
