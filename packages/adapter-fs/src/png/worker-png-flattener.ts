import type {
  FlattenedImage,
  ImageFlattener,
  LocalImage,
  StopSignal,
  TemporaryFile,
} from '@pod/core';
import { PngWorkStoppedError } from '../errors.js';
import { pngMayBeTransparent } from './flatten-job.js';
import { runInWorker, type PngWorker } from './worker-run.js';

/**
 * Lays PNGs that may be see-through onto white in a worker thread of its own,
 * one per image. JPEGs and PNGs without alpha or a transparent colour are
 * left as they are.
 */
export class WorkerPngFlattener implements ImageFlattener {
  constructor(
    private readonly newFile: () => Promise<TemporaryFile>,
    private readonly startWorker: () => PngWorker,
  ) {}

  async flatten(image: LocalImage, signal?: StopSignal): Promise<FlattenedImage | undefined> {
    if (image.mimeType !== 'image/png') return undefined;
    if (!(await pngMayBeTransparent(image.absolutePath))) return undefined;
    if (signal?.aborted) throw new PngWorkStoppedError();
    const file = await this.newFile();
    try {
      const job = { source: image.absolutePath, target: file.absolutePath };
      await runInWorker(this.startWorker, { type: 'flatten', job }, signal);
      return { ...file, mimeType: 'image/png' };
    } catch (error) {
      await file.dispose();
      throw error;
    }
  }
}
