import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { constants, createDeflate, createInflate } from 'node:zlib';
import type { Size } from '@pod/core';
import { keptChunkFor, scaledColorType, type PngHeader } from './chunks.js';
import { ImageDataReader } from './image-data-reader.js';
import { PngWriter } from './png-writer.js';
import { ScanlineScaler } from './scanline-scaler.js';

/** One PNG to scale: where it is read from and written to. */
export interface ScaleJob {
  readonly source: string;
  readonly target: string;
  readonly size: Size;
}

/**
 * Writes the 8-bit PNG at `source` scaled down to `size`, a few scanlines at a
 * time, so even a 150-megapixel image never sits in memory whole. Its colour
 * profile and pixel size chunks are carried over, and a transparent colour
 * becomes an alpha channel.
 */
export async function scalePngFile(job: ScaleJob, signal: AbortSignal): Promise<void> {
  let header: PngHeader | undefined;
  const reader = new ImageDataReader((read) => {
    header = read;
  });
  const kept = () => {
    const source = header;
    return source ? reader.kept.map((found) => keptChunkFor(found, source, job.size)) : [];
  };
  await pipeline(
    createReadStream(job.source),
    reader,
    createInflate(),
    new ScanlineScaler(() => header, job.size),
    createDeflate({ level: constants.Z_BEST_COMPRESSION, memLevel: 9 }),
    new PngWriter(() => ({ ...job.size, colorType: header ? scaledColorType(header) : 0 }), kept),
    createWriteStream(job.target, { mode: 0o600 }),
    { signal },
  );
}
