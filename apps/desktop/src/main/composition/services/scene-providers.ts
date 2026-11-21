import { AiProductReader, AiSceneInspector, AiStyleReader } from '@pod/adapter-ai';
import {
  CompareScene,
  ConfirmScenePrint,
  CreateBestScenes,
  CreateScene,
  DescribeProduct,
  DescribeSceneStyle,
} from '@pod/core';
import { copyFile } from 'node:fs/promises';
import { PhotoSaver } from '../../application/photos/photo-saver.js';
import { PhotoService } from '../../application/photos/photo-service.js';
import { ReferenceImages } from '../../application/scenes/reference-images.js';
import { sceneProblems } from '../../application/scenes/scene-problems.js';
import { SceneService } from '../../application/scenes/scene-service.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { readSmallFile } from '../../files/read-small-file.js';
import { languageModels } from '../ai/language-models.js';
import { translatePort } from '../provider-errors.js';
import { sceneGenerator } from '../ai/scene-generator.js';
import type { SharedParts } from '../shared-parts.js';

type CheckModels = ReturnType<typeof languageModels>;

type SceneParts = Pick<
  SharedParts,
  | 'secrets'
  | 'fetch'
  | 'writeTemporary'
  | 'mockups'
  | 'previews'
  | 'catalog'
  | 'print'
  | 'inspector'
  | 'assets'
  | 'clock'
  | 'ids'
  | 'options'
>;

/**
 * Scene photos made by the chosen image service and checked by a language
 * model, each with the seller's own key and chosen model. The checking model
 * also reads the product in a photo before its first scene; the text model
 * reads the style of reference photos.
 */
export function createSceneService(parts: SceneParts, settings: SettingsStore): SceneService {
  const checkModels = languageModels(parts, settings, 'checkModel');
  const compare = compareScenes(parts, settings, checkModels);
  const textModels = languageModels(parts, settings, 'textModel');
  const styleReader = new AiStyleReader(textModels);
  return new SceneService({
    createBest: createBestScenes(parts, settings, checkModels, compare),
    confirmPrint: new ConfirmScenePrint(parts.mockups),
    compare,
    describeStyle: new DescribeSceneStyle({
      query: parts.catalog.query,
      reader: translatePort(styleReader, textModels.service),
    }),
    references: new ReferenceImages({
      pickFile: parts.options.pickImageFile,
      writeDropped: (base64) => parts.writeTemporary(Buffer.from(base64, 'base64')),
      readFile: readSmallFile,
      inspector: parts.inspector,
    }),
    events: parts.options.events,
  });
}

/** Compares a scene with the product's photos, telling the issues in the window's language. */
function compareScenes(
  parts: SceneParts,
  settings: SettingsStore,
  checkModels: CheckModels,
): CompareScene {
  const inspector = new AiSceneInspector(checkModels, async () => (await settings.get()).language);
  return new CompareScene({
    mockups: parts.mockups,
    previews: parts.previews,
    inspector: translatePort(inspector, checkModels.service),
  });
}

/** Reads the product once, then makes scenes and keeps the ones that match it best. */
function createBestScenes(
  parts: SceneParts,
  settings: SettingsStore,
  checkModels: CheckModels,
  compare: CompareScene,
): CreateBestScenes {
  const generator = sceneGenerator(parts, settings);
  return new CreateBestScenes({
    describeProduct: new DescribeProduct({
      query: parts.catalog.query,
      mockups: parts.mockups,
      previews: parts.previews,
      reader: translatePort(new AiProductReader(checkModels), checkModels.service),
    }),
    createScene: new CreateScene({
      query: parts.catalog.query,
      printCatalog: parts.print.printCatalog,
      mockups: parts.mockups,
      generator: translatePort(generator, generator.service),
      inspector: parts.inspector,
      assets: parts.assets,
      clock: parts.clock,
      ids: parts.ids,
    }),
    compare,
    mockups: parts.mockups,
    problems: sceneProblems(parts.options.logError),
  });
}

/** Removing a design's photos, and saving them where the seller chooses. */
export function createPhotoService(
  parts: Pick<SharedParts, 'mockups' | 'assets' | 'options'>,
): PhotoService {
  return new PhotoService({
    mockups: parts.mockups,
    saver: new PhotoSaver({
      mockups: parts.mockups,
      pathOf: (key) => parts.assets.pathOf(key),
      pickSavePath: parts.options.pickSavePath,
      copyFile: (from, to) => copyFile(from, to),
    }),
    events: parts.options.events,
  });
}
