import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createDeflate, createInflate } from 'node:zlib';
import type { QuarterTurn } from '@pod/core';
import { UnsupportedPngError } from '../errors.js';
import { transparencyChunks, turnedChunk, type PngHeader } from './chunks.js';
import { ImageDataReader } from './image-data-reader.js';
import { PngWriter } from './png-writer.js';
import { ScanlineDecoder } from './scanline-decoder.js';
import { turnedLines } from './turned-lines.js';

/** Most bytes of the source's columns held at once while turning. */
const TURN_BAND_BYTES = 32 * 1024 * 1024;

/** One PNG to turn: where it is read from, where its pixels wait meanwhile, and where it is written. */
export interface RotateJob {
  readonly source: string;
  /** A file for the source's plain pixels, which the caller removes afterwards. */
  readonly scratch: string;
  readonly target: string;
  readonly turn: QuarterTurn;
  readonly bandBytes?: number | undefined;
}

/**
 * Writes the 8-bit PNG at `source` turned a quarter, with the same pixels,
 * colour profile and transparency. The pixels go to `scratch` first, as
 * turning needs every row of a column, and are read back a band of columns at
 * a time, so even a 150-megapixel image never sits in memory whole.
 */
export async function rotatePngFile(job: RotateJob, signal: AbortSignal): Promise<void> {
  let header: PngHeader | undefined;
  const reader = new ImageDataReader((read) => {
    header = read;
  });
  await pipeline(
    createReadStream(job.source),
    reader,
    createInflate(),
    new ScanlineDecoder(() => header),
    createWriteStream(job.scratch, { mode: 0o600 }),
    { signal },
  );
  if (!header) throw new UnsupportedPngError('no image data');
  const source = header;
  const extra = [...reader.kept.map(turnedChunk), ...transparencyChunks(source)];
  const file = await open(job.scratch, 'r');
  try {
    const pixels = { file, width: source.width, height: source.height, channels: source.channels };
    await pipeline(
      Readable.from(turnedLines(pixels, job.turn, job.bandBytes ?? TURN_BAND_BYTES, signal)),
      createDeflate({ level: constants.Z_BEST_COMPRESSION, memLevel: 9 }),
      new PngWriter(
        () => ({ width: source.height, height: source.width, colorType: source.colorType }),
        () => extra,
      ),
      createWriteStream(job.target, { mode: 0o600 }),
      { signal },
    );
  } finally {
    await file.close();
  }
}
