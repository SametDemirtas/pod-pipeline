import { AiRotationAdvisor } from '@pod/adapter-ai';
import { WorkerPngRotator } from '@pod/adapter-fs';
import type { CatalogApi } from '@pod/contracts';
import { GetDesign, RotateDesign } from '@pod/core';
import { RotationService } from '../../application/print/rotation-service.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { newTemporaryFile } from '../../files/temporary-file.js';
import { languageModels } from '../ai/language-models.js';
import { dataPath } from '../../files/data-folder.js';
import { translatePort } from '../provider-errors.js';
import type { SharedParts } from '../shared-parts.js';

/** PNGs turned in worker threads, their files in the downloads folder swept at start-up. */
export function pngRotator(parts: Pick<SharedParts, 'options' | 'inspector'>): WorkerPngRotator {
  return new WorkerPngRotator(
    () => newTemporaryFile(dataPath(parts.options.dataDirectory, 'downloads'), '.png'),
    parts.options.startPngWorker,
    parts.inspector,
  );
}

/**
 * Turning artwork to fit its print area, judged by the checking model with
 * the seller's key, as it reads images; its reason comes in the window's language.
 */
export function createRotationService(
  parts: Pick<
    SharedParts,
    | 'secrets'
    | 'fetch'
    | 'catalog'
    | 'previews'
    | 'assets'
    | 'clock'
    | 'print'
    | 'options'
    | 'inspector'
  >,
  settings: SettingsStore,
  catalog: Pick<CatalogApi, 'checkPrint'>,
): RotationService {
  const checkModels = languageModels(parts, settings, 'checkModel');
  const advisor = new AiRotationAdvisor(checkModels, async () => (await settings.get()).language);
  return new RotationService({
    rotate: new RotateDesign({
      query: parts.catalog.query,
      designs: parts.catalog.designs,
      previews: parts.previews,
      advisor: translatePort(advisor, checkModels.service),
      rotator: pngRotator(parts),
      assets: parts.assets,
      clock: parts.clock,
      orientation: parts.print.generator,
    }),
    getDesign: new GetDesign(parts.catalog.query),
    catalog,
    settings,
    events: parts.options.events,
  });
}
