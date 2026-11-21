import { beforeEach, describe, expect, it } from 'vitest';
import type { Design, DesignId } from '../catalog/model.js';
import type { PrintProduct } from '../print/print-product.js';
import type {
  MockupGenerator,
  MockupOrientationQuery,
  MockupRequest,
} from '../ports/print-provider.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import {
  FakeDownloader,
  FakeFileHost,
  FakeImageRotator,
  FakePrintCatalog,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryMockups,
  RecordingAssetStore,
  SAMPLE_MUG,
  SequentialIds,
} from '../testing/index.js';
import { CheckDesignPrint } from '../print/check-design-print.js';
import { CreateMockups } from './create-mockups.js';

const MUG = 'design-01-mug' as DesignId;

const requests: MockupRequest[] = [];

/** The photo of the area printed on, then a scene around the product. */
const generator = {
  generate: (request: MockupRequest) => {
    requests.push(request);
    return Promise.resolve(
      [request.area.placement, 'Lifestyle'].map((view) => ({
        url: `https://provider.test/${view}.png`,
        view,
      })),
    );
  },
};

/** Can also photograph a print area turned, when `turns` says so. */
const turning = {
  turns: true as boolean | Error,
  queries: [] as MockupOrientationQuery[],
  generate: generator.generate,
  supportsOrientation(query: MockupOrientationQuery) {
    this.queries.push(query);
    return this.turns instanceof Error ? Promise.reject(this.turns) : Promise.resolve(this.turns);
  },
};

describe('CreateMockups of turned artwork', () => {
  let folder: FakeSourceFolder;
  let catalog: InMemoryCatalog;
  let rotator: FakeImageRotator;
  let fileHost: FakeFileHost;
  let create: CreateMockups;

  const creating = (chosen: MockupGenerator, product: PrintProduct = SAMPLE_MUG) =>
    new CreateMockups({
      checkPrint: new CheckDesignPrint(catalog, new FakePrintCatalog([product]), chosen),
      generator: chosen,
      fileHost,
      downloader: new FakeDownloader(folder),
      inspector: folder,
      assets: Object.assign(new RecordingAssetStore(folder), {
        pathOf: (key: string) => `/data/${key}`,
      }),
      mockups: new InMemoryMockups(),
      clock: new FixedClock(),
      ids: new SequentialIds('mockup'),
      rotator,
    });

  beforeEach(async () => {
    requests.length = 0;
    turning.turns = true;
    turning.queries.length = 0;
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Tulip'));
    folder = new FakeSourceFolder('/data');
    rotator = new FakeImageRotator(folder);
    fileHost = new FakeFileHost();
    create = creating(generator);
  });

  const save = (changes: Partial<Design>) => catalog.designs.save(sampleDesign('01-mug', changes));

  it('turns the photo of the printed area back so the artwork stands upright', async () => {
    await save({ rotation: { degrees: 90, originalSha256: 'sha-01-mug', reason: 'Upright.' } });

    const made = await create.execute({ designId: MUG, variantId: '1320', fit: 'cover' });

    expect(rotator.requests).toEqual([
      { source: '/data/downloads/provider.test-default.png', turn: 270, signal: undefined },
    ]);
    // Only a PNG can be turned, so these photos are asked for losslessly.
    expect(requests.at(-1)?.lossless).toBe(true);
    expect(made.map((mockup) => [mockup.view, mockup.asset.width, mockup.asset.height])).toEqual([
      ['default', 1648, 3840],
      ['Lifestyle', 3840, 1648],
    ]);
    expect(() => folder.contentAt('/data/downloads/provider.test-default.png')).toThrow('ENOENT');
    expect(() => folder.contentAt('/data/turned/1.png')).toThrow('ENOENT');
  });

  it('turns a photo of artwork turned the other way the other way', async () => {
    await save({ rotation: { degrees: 270, originalSha256: 'sha-01-mug', reason: 'Upright.' } });

    await create.execute({ designId: MUG, variantId: '1320', fit: 'cover' });

    expect(rotator.requests.map((request) => request.turn)).toEqual([90]);
  });

  /** Portrait artwork imported as revision 1, then turned to fill the landscape area as revision 2. */
  async function saveTurned() {
    const portrait = {
      sha256: 'sha-upright',
      storageKey: 'assets/sha-upright',
      width: 1648,
      height: 3840,
    };
    await save({ asset: { ...sampleDesign('01-mug').asset, ...portrait } });
    await save({
      revision: 2,
      rotation: { degrees: 90, originalSha256: 'sha-upright', reason: 'Upright.' },
    });
  }

  describe('when the provider can photograph the area turned', () => {
    it('sends the upright artwork on the turned area and keeps every photo as made', async () => {
      await saveTurned();

      const made = await creating(turning).execute({
        designId: MUG,
        variantId: '1320',
        fit: 'cover',
      });

      expect(turning.queries).toEqual([
        { productId: '19', variantId: '1320', placement: 'default', orientation: 'vertical' },
      ]);
      expect(fileHost.shared).toEqual([
        {
          absolutePath: '/data/assets/sha-upright',
          mimeType: 'image/png',
          name: '01-mug-r1.png',
        },
      ]);
      expect(requests).toEqual([
        {
          productId: '19',
          variantIds: ['1320'],
          area: { placement: 'default', width: 1050, height: 2700, dpi: 300 },
          // The upright artwork covering the area stood on end, as the turned one covers it lying down.
          placement: { left: -54, top: 0, width: 1159, height: 2700 },
          imageUrl: 'https://host.test/01-mug-r1.png',
          lossless: false,
          orientation: 'vertical',
        },
      ]);
      expect(rotator.requests).toEqual([]);
      expect(made.map((mockup) => [mockup.view, mockup.printArea, mockup.designRevision])).toEqual([
        ['default', 'default', 2],
        ['Lifestyle', 'default', 2],
      ]);
    });

    it('falls back to turning the main photo back when the provider refuses', async () => {
      await saveTurned();
      turning.turns = false;

      await creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(fileHost.shared.map((file) => file.name)).toEqual(['01-mug-r2.png']);
      expect(requests.at(-1)).toMatchObject({
        area: { width: 2700, height: 1050 },
        lossless: true,
        orientation: undefined,
      });
      expect(rotator.requests.map((request) => request.turn)).toEqual([270]);
    });

    it('passes on a failure to tell whether the area can be turned', async () => {
      await saveTurned();
      turning.turns = new Error('cancelled');

      await expect(
        creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' }),
      ).rejects.toThrow('cancelled');
      expect(requests).toEqual([]);
    });

    it('falls back when no revision from before the turn is kept', async () => {
      await save({ rotation: { degrees: 90, originalSha256: 'sha-01-mug', reason: 'Upright.' } });

      await creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(turning.queries).toEqual([]);
      expect(requests.at(-1)?.lossless).toBe(true);
      expect(rotator.requests).toHaveLength(1);
    });

    it('falls back when the upright artwork already lies the way of the area', async () => {
      await save({});
      await save({
        revision: 2,
        rotation: { degrees: 90, originalSha256: 'sha-01-mug', reason: 'Upright.' },
      });

      await creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(turning.queries).toEqual([]);
      expect(requests.at(-1)).toMatchObject({ lossless: true, orientation: undefined });
    });

    it('stands a portrait area on its side for artwork turned the other way', async () => {
      const tall = { width: 1050, height: 2700 };
      const upright = {
        sha256: 'sha-wide',
        storageKey: 'assets/sha-wide',
        width: 3840,
        height: 1648,
      };
      await save({ asset: { ...sampleDesign('01-mug').asset, ...upright } });
      await save({
        revision: 2,
        asset: { ...sampleDesign('01-mug').asset, width: 1648, height: 3840 },
        rotation: { degrees: 270, originalSha256: 'sha-wide', reason: 'Upright.' },
      });
      const portrait: PrintProduct = {
        ...SAMPLE_MUG,
        variants: [
          {
            id: '1320',
            name: 'Tall',
            color: null,
            size: null,
            areas: [{ placement: 'default', dpi: 300, ...tall }],
          },
        ],
      };

      await creating(turning, portrait).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(turning.queries.map((query) => query.orientation)).toEqual(['horizontal']);
      expect(fileHost.shared.map((file) => file.name)).toEqual(['01-mug-r1.png']);
      expect(requests.at(-1)).toMatchObject({
        area: { width: 2700, height: 1050 },
        placement: { left: 0, top: -54, width: 2700, height: 1159 },
        lossless: false,
        orientation: 'horizontal',
      });
      expect(rotator.requests).toEqual([]);
    });

    it('takes the upright artwork only from the file that was turned', async () => {
      // Revisions 1 and 2 are other files; the file turned in revision 3 is not stored.
      await save({});
      await save({
        revision: 2,
        rotation: undefined,
        asset: { ...sampleDesign('01-mug').asset, sha256: 'sha-new', width: 1648, height: 3840 },
      });
      await save({
        revision: 3,
        rotation: { degrees: 90, originalSha256: 'sha-other', reason: 'Upright.' },
      });

      await creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(turning.queries).toEqual([]);
      expect(fileHost.shared.map((file) => file.name)).toEqual(['01-mug-r3.png']);
    });

    it('prints artwork left unturned upright on the turned area', async () => {
      await save({ asset: { ...sampleDesign('01-mug').asset, width: 1648, height: 3840 } });

      const made = await creating(turning).execute({
        designId: MUG,
        variantId: '1320',
        fit: 'cover',
      });

      expect(turning.queries.map((query) => query.orientation)).toEqual(['vertical']);
      expect(fileHost.shared.map((file) => file.name)).toEqual(['01-mug-r1.png']);
      expect(requests.at(-1)).toMatchObject({
        area: { width: 1050, height: 2700 },
        lossless: false,
        orientation: 'vertical',
      });
      expect(rotator.requests).toEqual([]);
      expect(made.map((mockup) => mockup.designRevision)).toEqual([1, 1]);
    });

    it('does not ask for artwork that already lies the way of the area', async () => {
      await save({});

      await creating(turning).execute({ designId: MUG, variantId: '1320', fit: 'cover' });

      expect(turning.queries).toEqual([]);
      expect(requests.at(-1)).toMatchObject({ lossless: false, orientation: undefined });
    });
  });

  it('leaves the photos of artwork that was never turned as they are', async () => {
    await save({});

    await create.execute({ designId: MUG, variantId: '1320', fit: 'cover' });

    expect(rotator.requests).toEqual([]);
  });
});
