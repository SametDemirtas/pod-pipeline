import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  RealEsrganUpscaler,
  UpscaleFailedError as EngineFailedError,
  UpscaleStoppedError,
  type StartProcess,
} from '@pod/adapter-realesrgan';
import { WorkerPngScaler, type PngWorker } from '@pod/adapter-fs';
import type { CatalogApi } from '@pod/contracts';
import { GetDesign, UpscaleDesign, type Upscaler } from '@pod/core';
import { pngRotator } from './rotation-providers.js';
import { UpscaleFailedError } from '../../application/errors/print-errors.js';
import { WorkStoppedError } from '../../application/errors/work-stopped.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { UpscaleService } from '../../application/print/upscale-service.js';
import { newTemporaryFile } from '../../files/temporary-file.js';
import { dataPath } from '../../files/data-folder.js';
import type { SharedParts } from '../shared-parts.js';

/** The tile size `0` lets the engine choose one that fits the graphics memory. */
const TILE_SIZE = 0;
/** A 2560 × 3200 artwork takes minutes on a slow graphics card, never this long. */
const TIMEOUT_MS = 20 * 60_000;

/** The engine's errors as the app's, which clients translate. */
function withAppErrors(upscaler: Upscaler): Upscaler {
  return {
    scale: upscaler.scale,
    upscale: async (request) => {
      try {
        return await upscaler.upscale(request);
      } catch (error) {
        if (error instanceof UpscaleStoppedError)
          throw new WorkStoppedError('Upscaling was stopped');
        if (error instanceof EngineFailedError) throw new UpscaleFailedError(error.reason);
        throw error;
      }
    },
  };
}

/** The engine's file in the upscaler folder, and how it is started. */
export interface UpscaleEngine {
  readonly fileName: string;
  readonly start: StartProcess;
}

/** Real-ESRGAN as the fetch script or the installer puts it in the folder, for the system. */
function realEsrganEngine(platform: NodeJS.Platform): UpscaleEngine {
  return {
    fileName: platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan',
    start: (command, args) => spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] }),
  };
}

/** Real-ESRGAN, when the fetch script or the installer put it in `directory`. */
function installedUpscaler(
  parts: Pick<SharedParts, 'options'>,
  directory: string,
  engine: UpscaleEngine,
): Upscaler | null {
  const executable = join(directory, engine.fileName);
  if (!existsSync(executable)) return null;
  return withAppErrors(
    new RealEsrganUpscaler({
      executable,
      modelsDirectory: join(directory, 'models'),
      newFile: () => newTemporaryFile(dataPath(parts.options.dataDirectory, 'downloads'), '.png'),
      start: engine.start,
      tileSize: TILE_SIZE,
      timeoutMs: TIMEOUT_MS,
    }),
  );
}

/**
 * What a scaling worker may use. It holds a few scanlines at a time, so a
 * runaway one is stopped long before it could take the app's memory.
 */
export const PNG_WORKER_LIMITS = {
  maxOldGenerationSizeMb: 256,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 4,
} as const;

/** PNGs scaled in worker threads into the downloads folder, swept at start-up. */
export function pngScaler(dataDirectory: string, startWorker: () => PngWorker): WorkerPngScaler {
  return new WorkerPngScaler(
    () => newTemporaryFile(dataPath(dataDirectory, 'downloads'), '.png'),
    startWorker,
  );
}

/** Upscaling on this computer, for the window and for preparing listings. */
export function createUpscaleService(
  parts: Pick<SharedParts, 'options' | 'catalog' | 'assets' | 'inspector' | 'clock' | 'print'>,
  settings: SettingsStore,
  catalog: Pick<CatalogApi, 'checkPrint'>,
  engine: UpscaleEngine = realEsrganEngine(process.platform),
): UpscaleService {
  const upscaler = installedUpscaler(parts, parts.options.upscalerDirectory, engine);
  return new UpscaleService({
    upscale:
      upscaler &&
      new UpscaleDesign({
        query: parts.catalog.query,
        unitOfWork: parts.catalog,
        upscaler,
        scaler: pngScaler(parts.options.dataDirectory, parts.options.startPngWorker),
        rotator: pngRotator(parts),
        assets: parts.assets,
        inspector: parts.inspector,
        clock: parts.clock,
        orientation: parts.print.generator,
      }),
    getDesign: new GetDesign(parts.catalog.query),
    catalog,
    settings,
    events: parts.options.events,
  });
}
