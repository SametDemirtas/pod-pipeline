import { stat } from 'node:fs/promises';
import type { ImageScaler, WrittenPng, Size, StopSignal, TemporaryFile } from '@pod/core';
import { PngWorkStoppedError } from '../errors.js';
import { runInWorker, type PngWorker } from './worker-run.js';

/**
 * Scales PNGs in a worker thread of its own, one per image, so decoding and
 * re-encoding a print file never holds up the main thread.
 */
export class WorkerPngScaler implements ImageScaler {
  constructor(
    private readonly newFile: () => Promise<TemporaryFile>,
    private readonly startWorker: () => PngWorker,
  ) {}

  async scale(source: string, size: Size, signal?: StopSignal): Promise<WrittenPng> {
    if (signal?.aborted) throw new PngWorkStoppedError();
    const file = await this.newFile();
    try {
      if (signal?.aborted) throw new PngWorkStoppedError();
      const job = { source, target: file.absolutePath, size };
      await runInWorker(this.startWorker, { type: 'scale', job }, signal);
      const { size: byteSize } = await stat(file.absolutePath);
      return { ...file, ...size, byteSize };
    } catch (error) {
      await file.dispose();
      throw error;
    }
  }
}
