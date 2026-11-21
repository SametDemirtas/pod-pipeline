import { CreateMockups } from '@pod/core';
import { PrintService } from '../../application/print/print-service.js';
import { SettingsPorts } from '../../application/settings/settings-ports.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import type { SharedParts } from '../shared-parts.js';
import { pngRotator } from './rotation-providers.js';
import { pngScaler } from './upscale-providers.js';

/** Print checks against Printful's print areas and Printful's mockups. */
export function createPrintService(
  parts: Pick<
    SharedParts,
    'print' | 'checkPrint' | 'inspector' | 'assets' | 'mockups' | 'clock' | 'ids' | 'options'
  >,
  settings: SettingsStore,
): PrintService {
  const { print, checkPrint } = parts;
  return new PrintService({
    checkPrint,
    printCatalog: print.printCatalog,
    facts: new SettingsPorts(settings),
    createMockups: new CreateMockups({
      checkPrint,
      generator: print.generator,
      fileHost: print.fileHost,
      downloader: print.downloader,
      inspector: parts.inspector,
      assets: parts.assets,
      mockups: parts.mockups,
      clock: parts.clock,
      ids: parts.ids,
      scaler: pngScaler(parts.options.dataDirectory, parts.options.startPngWorker),
      rotator: pngRotator(parts),
    }),
    mockups: parts.mockups,
    events: parts.options.events,
  });
}
