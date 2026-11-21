import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckDesignPrint, CreateMockups, type GeneratedMockup } from '@pod/core';
import {
  FakeDownloader,
  FakeFileHost,
  FakeMockupGenerator,
  FakePrintCatalog,
  FakeProductFacts,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryMockups,
  RecordingAssetStore,
  SequentialIds,
} from '@pod/core/testing';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import { MockupsInProgressError } from '../errors/print-errors.js';
import { PrintService } from './print-service.js';

const facts = { material: 'Ceramic', care: 'Dishwasher safe', fit: '', size: '' };

describe('PrintService', () => {
  let generator: FakeMockupGenerator;
  let catalogChanged: ReturnType<typeof vi.fn<() => void>>;
  let service: PrintService;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    const folder = new FakeSourceFolder('/data');
    const printCatalog = new FakePrintCatalog();
    const mockups = new InMemoryMockups();
    generator = new FakeMockupGenerator();
    catalogChanged = vi.fn();
    const checkPrint = new CheckDesignPrint(catalog, printCatalog);
    service = new PrintService({
      checkPrint,
      printCatalog,
      facts: new FakeProductFacts(facts),
      createMockups: new CreateMockups({
        checkPrint,
        generator,
        fileHost: new FakeFileHost(),
        downloader: new FakeDownloader(folder),
        inspector: folder,
        assets: Object.assign(new RecordingAssetStore(folder), { pathOf: (key: string) => key }),
        mockups,
        clock: new FixedClock(),
        ids: new SequentialIds('mockup'),
      }),
      mockups,
      events: { catalogChanged },
    });
  });

  it('lists the sizes a family comes in, and none for a product it lacks', async () => {
    expect(await service.listFamilySizes({ familyId: 'mug' })).toEqual(['11 oz', '15 oz']);
    expect(await service.listFamilySizes({ familyId: 'lamp' })).toEqual([]);
  });

  it('reports the print check with every variant of the product', async () => {
    expect(await service.checkPrint({ designId: 'design-01-mug', fit: 'contain' })).toEqual({
      designId: 'design-01-mug',
      productId: '19',
      productName: 'White Glossy Mug',
      variants: [
        {
          id: '1320',
          name: 'White Glossy Mug 11 oz',
          color: 'White',
          size: '11 oz',
          areas: [{ placement: 'default', width: 2700, height: 1050, dpi: 300 }],
        },
        {
          id: '4830',
          name: 'White Glossy Mug 15 oz',
          color: 'White',
          size: '15 oz',
          areas: [{ placement: 'default', width: 2700, height: 1140, dpi: 300 }],
        },
      ],
      variantId: '1320',
      printArea: 'default',
      fit: 'contain',
      placement: { left: 127, top: 0, width: 2447, height: 1050 },
      effectiveDpi: 470,
      quality: 'good',
      areaCovered: 0.906,
      imageCropped: 0,
      turnsToFit: false,
      upright: null,
      productFacts: facts,
    });
  });

  it('creates mockups, announces them and lists them', async () => {
    const made = await service.createMockups({ designId: 'design-01-mug', fit: 'contain' });

    expect(made.map((mockup) => [mockup.id, mockup.view, mockup.createdAt])).toEqual([
      ['mockup-0001', 'Front', '2026-01-01T00:00:00.000Z'],
      ['mockup-0002', 'Left', '2026-01-01T00:00:00.000Z'],
    ]);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
    expect(await service.listMockups({ id: 'design-01-mug' })).toEqual(made);
  });

  it('refuses a second mockup request while one is running', async () => {
    let finish: (mockups: readonly GeneratedMockup[]) => void = () => undefined;
    const generate = vi.spyOn(generator, 'generate').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.createMockups({ designId: 'design-01-mug', fit: 'contain' });

    await expect(
      service.createMockups({ designId: 'design-01-mug', fit: 'cover' }),
    ).rejects.toBeInstanceOf(MockupsInProgressError);
    await vi.waitFor(() => {
      expect(generate).toHaveBeenCalled();
    });
    finish([]);
    expect(await first).toEqual([]);
    expect(await service.listMockups({ id: 'design-01-mug' })).toEqual([]);
  });
});
