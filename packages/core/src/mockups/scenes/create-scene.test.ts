import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { PrintCatalog } from '../../ports/print-provider.js';
import { sampleConcept, sampleDesign } from '../../testing/contract/index.js';
import {
  FakePrintCatalog,
  FakeSceneGenerator,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryMockups,
  RecordingAssetStore,
  SAMPLE_PRODUCT_DETAILS,
  SequentialIds,
} from '../../testing/index.js';
import { CreateScene } from './create-scene.js';
import type { Mockup, MockupId } from '../mockup.js';
import type { SceneLook } from './scene-look.js';

const MUG = 'design-01-mug' as DesignId;
const PLAIN: SceneLook = { shape: '4:3' };

const photo: Mockup = {
  id: 'm1' as MockupId,
  designId: MUG,
  designRevision: 2,
  variantId: '1320',
  printArea: 'default',
  view: 'Front',
  scenePrompt: null,
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: 'm1',
    storageKey: 'ab/m1',
    mimeType: 'image/png',
    width: 1000,
    height: 1000,
    byteSize: 10,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
};

describe('CreateScene', () => {
  let folder: FakeSourceFolder;
  let catalog: InMemoryCatalog;
  let generator: FakeSceneGenerator;
  let mockups: InMemoryMockups;
  let create: CreateScene;

  const useCase = (printCatalog: PrintCatalog = new FakePrintCatalog()) =>
    new CreateScene({
      query: catalog,
      printCatalog,
      mockups,
      generator,
      inspector: folder,
      assets: Object.assign(new RecordingAssetStore(folder), {
        pathOf: (key: string) => `/data/${key}`,
      }),
      clock: new FixedClock(),
      ids: new SequentialIds('scene'),
    });

  beforeEach(async () => {
    folder = new FakeSourceFolder('/data');
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    generator = new FakeSceneGenerator(folder);
    mockups = new InMemoryMockups();
    await mockups.replace(MUG, { variantId: '1320', printArea: 'default' }, [photo]);
    create = useCase();
  });

  it('builds a scene around the photo and keeps it unchecked and unconfirmed', async () => {
    const scene = await create.execute({
      designId: MUG,
      mockupId: 'm1',
      prompt: '  wooden   kitchen table, morning light ',
      details: null,
      look: PLAIN,
    });

    expect(generator.requests).toEqual([
      {
        image: { absolutePath: '/data/ab/m1', mimeType: 'image/png' },
        prompt: expect.stringContaining(
          'Product: mug in White.\n\n' +
            'Scene description (may be in another language):\n' +
            'wooden kitchen table, morning light\n\nKeep the product exactly',
        ) as string,
        shape: '4:3',
      },
    ]);
    expect(generator.requests[0]?.prompt).not.toContain('Glossy');
    expect(generator.requests[0]?.prompt).not.toContain('Product details');
    expect(scene).toMatchObject({
      id: 'scene-0001',
      designId: MUG,
      designRevision: 2,
      variantId: '1320',
      printArea: 'default',
      view: 'Scene',
      scenePrompt: 'wooden kitchen table, morning light',
      sceneLook: PLAIN,
      sceneCheck: null,
      printConfirmed: false,
      sourceAsset: photo.asset,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(await mockups.listForDesign(MUG)).toEqual([scene, photo]);
  });

  it('makes the scene in the chosen shape and look, leaving out what the family is not offered', async () => {
    const scene = await create.execute({
      designId: MUG,
      mockupId: 'm1',
      prompt: 'table',
      details: null,
      look: { shape: '1:1', lighting: 'moody', cameraHeight: 'topDown' },
    });

    expect(generator.requests[0]?.shape).toBe('1:1');
    expect(generator.requests[0]?.prompt).toContain(
      'table\n\nLook (takes precedence over the scene description; everything below still applies): low-key light',
    );
    expect(generator.requests[0]?.prompt).not.toContain('top-down');
    expect(scene.sceneLook).toEqual({ shape: '1:1', lighting: 'moody' });
  });

  it("adds the photo's product details when they were read", async () => {
    await create.execute({
      designId: MUG,
      mockupId: 'm1',
      prompt: 'table',
      details: SAMPLE_PRODUCT_DETAILS,
      look: PLAIN,
    });

    expect(generator.requests[0]?.prompt).toContain(
      'Product: mug in White.\n\nProduct details, read from the photo:\n',
    );
  });

  it('leaves out the colour when the print provider cannot be asked', async () => {
    create = useCase({ findProduct: () => Promise.reject(new Error('offline')) });

    await create.execute({
      designId: MUG,
      mockupId: 'm1',
      prompt: 'table',
      details: null,
      look: PLAIN,
    });

    expect(generator.requests[0]?.prompt).toContain('Product: mug.\n');
  });

  it('removes the generated file even when storing it fails', async () => {
    generator.notAnImage = true;

    await expect(
      create.execute({
        designId: MUG,
        mockupId: 'm1',
        prompt: 'table',
        details: null,
        look: PLAIN,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(() => folder.contentAt('/data/scenes/Edit-1.png')).toThrow(/ENOENT/);
  });

  it.each([
    ['an empty prompt', { prompt: '  ' }, ValidationError],
    ['a long prompt', { prompt: 'x'.repeat(1001) }, ValidationError],
    ['an unknown photo', { mockupId: 'gone' }, NotFoundError],
  ])('refuses %s before generating', async (_case, overrides, error) => {
    await expect(
      create.execute({
        designId: MUG,
        mockupId: 'm1',
        prompt: 'table',
        details: null,
        look: PLAIN,
        ...overrides,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(generator.requests).toEqual([]);
  });

  it('passes on a failed generation without storing anything', async () => {
    generator.failWith = new Error('quota exceeded');

    await expect(
      create.execute({
        designId: MUG,
        mockupId: 'm1',
        prompt: 'table',
        details: null,
        look: PLAIN,
      }),
    ).rejects.toThrow('quota exceeded');
    expect(await mockups.listForDesign(MUG)).toHaveLength(1);
  });

  it('builds scenes only from the print provider photos', async () => {
    const scene = await create.execute({
      designId: MUG,
      mockupId: 'm1',
      prompt: 'table',
      details: null,
      look: PLAIN,
    });

    await expect(
      create.execute({
        designId: MUG,
        mockupId: scene.id,
        prompt: 'beach',
        details: null,
        look: PLAIN,
      }),
    ).rejects.toThrow(/print provider's photos/);
  });
});
