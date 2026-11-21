import type { FileHandle } from 'node:fs/promises';
import type { QuarterTurn } from '@pod/core';
import { bestFiltered } from './filters.js';

/** The pixels of an image as stored in a file, row after row, with their size. */
export interface StoredPixels {
  readonly file: FileHandle;
  readonly width: number;
  readonly height: number;
  /** Bytes per pixel. */
  readonly channels: number;
}

/**
 * The scanlines of the stored image turned `turn` degrees clockwise, each
 * filtered as it compresses best. A turned row is a column of the source, so
 * columns are read a band at a time, each band at most `bandBytes` large.
 */
export async function* turnedLines(
  pixels: StoredPixels,
  turn: QuarterTurn,
  bandBytes: number,
  signal: AbortSignal,
): AsyncGenerator<Buffer> {
  const { width, height, channels } = pixels;
  const columnBytes = height * channels;
  const bandWidth = Math.max(1, Math.min(width, Math.floor(bandBytes / columnBytes)));
  const band = new Uint8Array(bandWidth * columnBytes);
  const slice = Buffer.alloc(bandWidth * channels);
  let previous: Uint8Array = new Uint8Array(columnBytes);
  const starts = Array.from({ length: Math.ceil(width / bandWidth) }, (_, at) => at * bandWidth);
  // Turned clockwise, the first row is the left column; turned the other way, the right one.
  if (turn === 270) starts.reverse();
  for (const start of starts) {
    const columns = Math.min(bandWidth, width - start);
    await readBand(pixels, start, columns, slice, band, signal);
    for (let step = 0; step < columns; step += 1) {
      const column = turn === 90 ? step : columns - 1 - step;
      const line = turnedColumn(band, column, height, channels, turn);
      yield Buffer.from(bestFiltered(line, previous, channels));
      previous = line;
    }
  }
}

/** Columns `start` to `start + columns` of every row, stored column after column in `band`. */
async function readBand(
  { file, width, height, channels }: StoredPixels,
  start: number,
  columns: number,
  slice: Buffer,
  band: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  const length = columns * channels;
  for (let row = 0; row < height; row += 1) {
    signal.throwIfAborted();
    await file.read(slice, 0, length, (row * width + start) * channels);
    for (let column = 0; column < columns; column += 1) {
      const to = (column * height + row) * channels;
      const from = column * channels;
      for (let c = 0; c < channels; c += 1) band[to + c] = slice[from + c] ?? 0;
    }
  }
}

/** One column of the band as a row of the turned image: bottom first when turned clockwise. */
function turnedColumn(
  band: Uint8Array,
  column: number,
  height: number,
  channels: number,
  turn: QuarterTurn,
): Uint8Array {
  const from = column * height * channels;
  const stored = band.subarray(from, from + height * channels);
  if (turn === 270) return Uint8Array.from(stored);
  const line = new Uint8Array(stored.length);
  for (let row = 0; row < height; row += 1) {
    const to = (height - 1 - row) * channels;
    const at = row * channels;
    for (let c = 0; c < channels; c += 1) line[to + c] = stored[at + c] ?? 0;
  }
  return line;
}
