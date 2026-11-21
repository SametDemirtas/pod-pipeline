import { stat } from 'node:fs/promises';
import type {
  ImageInspector,
  ImageRotator,
  QuarterTurn,
  WrittenPng,
  StopSignal,
  TemporaryFile,
} from '@pod/core';
import { PngWorkFailedError, PngWorkStoppedError } from '../errors.js';
import { runInWorker, type PngWorker } from './worker-run.js';

/**
 * Turns PNGs in a worker thread of its own, one per image. The source's plain
 * pixels wait in a second temporary file meanwhile, removed once it is done.
 */
export class WorkerPngRotator implements ImageRotator {
  constructor(
    private readonly newFile: () => Promise<TemporaryFile>,
    private readonly startWorker: () => PngWorker,
    private readonly inspector: ImageInspector,
  ) {}

  async rotate(source: string, turn: QuarterTurn, signal?: StopSignal): Promise<WrittenPng> {
    if (signal?.aborted) throw new PngWorkStoppedError();
    const file = await this.newFile();
    try {
      const scratch = await this.newFile();
      try {
        const job = { source, scratch: scratch.absolutePath, target: file.absolutePath, turn };
        await runInWorker(this.startWorker, { type: 'rotate', job }, signal);
      } finally {
        await scratch.dispose();
      }
      const image = await this.inspector.inspect(file.absolutePath);
      if (!image) throw new PngWorkFailedError('the turned image cannot be read');
      const { size: byteSize } = await stat(file.absolutePath);
      return { ...file, width: image.width, height: image.height, byteSize };
    } catch (error) {
      await file.dispose();
      throw error;
    }
  }
}
