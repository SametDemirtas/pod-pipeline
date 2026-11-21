import { vi } from 'vitest';
import type { CreatedScenesDto, MockupDto } from '@pod/contracts';
import {
  CompareScene,
  ConfirmScenePrint,
  CreateBestScenes,
  CreateScene,
  DescribeProduct,
  DescribeSceneStyle,
  type DesignId,
} from '@pod/core';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import {
  FakeImagePreviews,
  FakePrintCatalog,
  FakeProductReader,
  FakeSceneGenerator,
  FakeSceneInspector,
  FakeSourceFolder,
  FakeStyleReader,
  FixedClock,
  InMemoryCatalog,
  InMemoryMockups,
  RecordingAssetStore,
  SequentialIds,
} from '@pod/core/testing';
import type { ReferenceImages } from '../application/scenes/reference-images.js';
import { PhotoSaver } from '../application/photos/photo-saver.js';
import { PhotoService } from '../application/photos/photo-service.js';
import { sceneProblems } from '../application/scenes/scene-problems.js';
import { SceneService } from '../application/scenes/scene-service.js';
import { photo } from './mockup-fixtures.js';

export const MUG = 'design-01-mug' as DesignId;
export const SHIRT = 'design-01-t-shirt' as DesignId;
export const PLAIN = { shape: '4:3' } as const;

/** A scene of the mug's front photo in the plain look. */
export function sceneRequest(prompt: string, candidates: 1 | 2 = 1) {
  return { designId: MUG, mockupId: 'm1', prompt, candidates, look: PLAIN };
}

/** Holds the next scene until `finish` is called; `generating` resolves once it started. */
export function holdNextScene(generator: FakeSceneGenerator) {
  const generate = generator.generate.bind(generator);
  let finish: () => void = () => undefined;
  const generating = new Promise<void>((started) => {
    generator.generate = (request) => {
      generator.generate = generate;
      started();
      return new Promise((resolve) => {
        finish = () => {
          resolve(generate(request));
        };
      });
    };
  });
  return {
    generating,
    finish: () => {
      finish();
    },
  };
}

/** The one scene a request for one candidate keeps. */
export async function onlyScene(created: Promise<CreatedScenesDto>): Promise<MockupDto> {
  const [scene, ...others] = (await created).scenes;
  if (!scene || others.length > 0) throw new Error('Expected exactly one scene');
  return scene;
}

export async function setUp() {
  const folder = new FakeSourceFolder('/data');
  const generator = new FakeSceneGenerator(folder);
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01'));
  await catalog.designs.save(sampleDesign('01-mug'));
  await catalog.designs.save(sampleDesign('01-t-shirt'));
  const mockups = new InMemoryMockups();
  await mockups.replace(MUG, { variantId: '1320', printArea: 'default' }, [photo]);
  const reader = new FakeStyleReader();
  const take = vi.fn<ReferenceImages['take']>(() =>
    Promise.resolve({ data: new Uint8Array([1]), mimeType: 'image/png' }),
  );
  const catalogChanged = vi.fn<() => void>();
  const logError = vi.fn<(error: unknown) => void>();
  const inspector = new FakeSceneInspector();
  const previews = new FakeImagePreviews();
  const compare = new CompareScene({ mockups, previews, inspector });
  const products = new FakeProductReader();
  const service = new SceneService({
    createBest: new CreateBestScenes({
      describeProduct: new DescribeProduct({ query: catalog, mockups, previews, reader: products }),
      createScene: new CreateScene({
        query: catalog,
        printCatalog: new FakePrintCatalog(),
        mockups,
        generator,
        inspector: folder,
        assets: Object.assign(new RecordingAssetStore(folder), { pathOf: (key: string) => key }),
        clock: new FixedClock(),
        ids: new SequentialIds('scene'),
      }),
      compare,
      mockups,
      problems: sceneProblems(logError),
    }),
    confirmPrint: new ConfirmScenePrint(mockups),
    compare,
    describeStyle: new DescribeSceneStyle({ query: catalog, reader }),
    references: { take },
    events: { catalogChanged },
  });
  return {
    service,
    photos: photoService(mockups, catalogChanged),
    generator,
    mockups,
    inspector,
    products,
    reader,
    take,
    catalogChanged,
    logError,
  };
}

/** Photos kept in memory, which the seller never saves anywhere. */
function photoService(mockups: InMemoryMockups, catalogChanged: () => void): PhotoService {
  return new PhotoService({
    mockups,
    saver: new PhotoSaver({
      mockups,
      pathOf: (key) => key,
      pickSavePath: () => Promise.resolve(null),
      copyFile: () => Promise.resolve(),
    }),
    events: { catalogChanged },
  });
}
