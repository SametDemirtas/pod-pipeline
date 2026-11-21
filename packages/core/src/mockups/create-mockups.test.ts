import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { PrintProductUnavailableError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import {
  FakeDownloader,
  FakeFileHost,
  FakeMockupGenerator,
  FakePrintCatalog,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryMockups,
  RecordingAssetStore,
  SAMPLE_MUG,
  SAMPLE_SHIRT,
  SequentialIds,
} from '../testing/index.js';
import { CheckDesignPrint } from '../print/check-design-print.js';
import { CreateMockups } from './create-mockups.js';

const MUG = 'design-01-mug' as DesignId;

describe('CreateMockups', () => {
  let folder: FakeSourceFolder;
  let generator: FakeMockupGenerator;
  let fileHost: FakeFileHost;
  let downloader: FakeDownloader;
  let mockups: InMemoryMockups;
  let create: CreateMockups;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Tulip'));
    await catalog.designs.save(sampleDesign('01-mug', { revision: 1 }));
    await catalog.designs.save(sampleDesign('01-blanket'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    folder = new FakeSourceFolder('/data');
    generator = new FakeMockupGenerator();
    fileHost = new FakeFileHost();
    downloader = new FakeDownloader(folder);
    mockups = new InMemoryMockups();
    const store = new RecordingAssetStore(folder);
    create = new CreateMockups({
      checkPrint: new CheckDesignPrint(catalog, new FakePrintCatalog([SAMPLE_MUG, SAMPLE_SHIRT])),
      generator,
      fileHost,
      downloader,
      inspector: folder,
      assets: Object.assign(store, { pathOf: (key: string) => `/data/${key}` }),
      mockups,
      clock: new FixedClock(),
      ids: new SequentialIds('mockup'),
    });
  });

  it('shares the design, renders photos, stores them and stops sharing', async () => {
    const made = await create.execute({ designId: MUG, variantId: '4830', fit: 'cover' });

    expect(fileHost.shared).toEqual([
      { absolutePath: '/data/assets/sha-01-mug', mimeType: 'image/png', name: '01-mug-r1.png' },
    ]);
    expect(generator.requests).toEqual([
      {
        productId: '19',
        variantIds: ['4830'],
        area: { placement: 'default', width: 2700, height: 1140, dpi: 300 },
        placement: { left: 0, top: -9, width: 2700, height: 1159 },
        imageUrl: 'https://host.test/01-mug-r1.png',
        lossless: false,
      },
    ]);
    expect(fileHost.released).toBe(1);
    expect(made.map((mockup) => [mockup.id, mockup.view, mockup.variantId])).toEqual([
      ['mockup-0001', 'Front', '4830'],
      ['mockup-0002', 'Left', '4830'],
    ]);
    expect(made[0]).toMatchObject({
      designId: MUG,
      designRevision: 1,
      asset: { mimeType: 'image/png', width: 3840, height: 1648 },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(downloader.disposed).toBe(2);
    expect(await mockups.listForDesign(MUG)).toEqual(made);
  });

  it('sends a half-size copy of a large PNG for the photos and deletes it', async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Tulip'));
    const big = sampleDesign('01-mug', { revision: 1 });
    await catalog.designs.save({ ...big, asset: { ...big.asset, byteSize: 60_000_000 } });
    const scaled: unknown[] = [];
    let disposed = 0;
    const store = new RecordingAssetStore(folder);
    const withScaler = new CreateMockups({
      checkPrint: new CheckDesignPrint(catalog, new FakePrintCatalog([SAMPLE_MUG, SAMPLE_SHIRT])),
      generator,
      fileHost,
      downloader,
      inspector: folder,
      assets: Object.assign(store, { pathOf: (key: string) => `/data/${key}` }),
      mockups,
      clock: new FixedClock(),
      ids: new SequentialIds('mockup'),
      scaler: {
        scale: (source, size) => {
          scaled.push({ source, size });
          return Promise.resolve({
            absolutePath: '/tmp/half.png',
            ...size,
            byteSize: 15_000_000,
            dispose: () => {
              disposed++;
              return Promise.resolve();
            },
          });
        },
      },
    });

    await withScaler.execute({ designId: MUG, variantId: '4830', fit: 'cover' });

    expect(scaled).toEqual([
      {
        source: '/data/assets/sha-01-mug',
        size: { width: Math.round(big.asset.width / 2), height: Math.round(big.asset.height / 2) },
      },
    ]);
    expect(fileHost.shared).toEqual([
      { absolutePath: '/tmp/half.png', mimeType: 'image/png', name: '01-mug-r1.png' },
    ]);
    expect(disposed).toBe(1);
  });

  it('replaces the earlier photos of the same variant only', async () => {
    await create.execute({ designId: MUG, variantId: '1320', fit: 'contain' });
    const first = await create.execute({ designId: MUG, variantId: '4830', fit: 'contain' });
    const again = await create.execute({ designId: MUG, variantId: '4830', fit: 'contain' });

    const stored = await mockups.listForDesign(MUG);
    expect(stored.map((mockup) => mockup.variantId)).toEqual(['4830', '4830', '1320', '1320']);
    expect(stored).not.toContainEqual(first[0]);
    expect(stored.slice(0, 2)).toEqual(again);
  });

  it('keeps the photos of the front and the back of a shirt apart', async () => {
    const shirt = 'design-01-t-shirt';
    await create.execute({ designId: shirt, printArea: 'back', fit: 'contain' });
    await create.execute({ designId: shirt, fit: 'contain' });

    expect(generator.requests.map((request) => request.area.placement)).toEqual(['back', 'front']);
    const stored = await mockups.listForDesign(shirt as DesignId);
    expect(stored.map((mockup) => [mockup.variantId, mockup.printArea])).toEqual([
      ['4000', 'front'],
      ['4000', 'front'],
      ['4000', 'back'],
      ['4000', 'back'],
    ]);
  });

  it('stops sharing when rendering fails and keeps the earlier photos', async () => {
    await create.execute({ designId: MUG, fit: 'contain' });
    generator.failWith = new Error('Printful is down');

    await expect(create.execute({ designId: MUG, fit: 'contain' })).rejects.toThrow(
      'Printful is down',
    );
    expect(fileHost.released).toBe(2);
    expect(await mockups.listForDesign(MUG)).toHaveLength(2);
  });

  it('keeps the photos when the shared file cannot be removed', async () => {
    fileHost.failRelease = true;

    expect(await create.execute({ designId: MUG, fit: 'contain' })).toHaveLength(2);
  });

  it('refuses a download that is not an image', async () => {
    const download = downloader.download.bind(downloader);
    downloader.download = async (url) => {
      const file = await download(url);
      folder.write({ relativePath: 'downloads/Front.png', content: 'html', image: null });
      return { ...file, absolutePath: '/data/downloads/Front.png' };
    };

    await expect(create.execute({ designId: MUG, fit: 'contain' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await mockups.listForDesign(MUG)).toEqual([]);
  });

  it('checks the design before sharing anything', async () => {
    await expect(
      create.execute({ designId: 'design-01-blanket', fit: 'contain' }),
    ).rejects.toBeInstanceOf(PrintProductUnavailableError);
    expect(fileHost.shared).toEqual([]);
  });
});
