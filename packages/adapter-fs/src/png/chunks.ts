import { crc32 } from 'node:zlib';
import { UnsupportedPngError } from '../errors.js';

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Colour types of 8-bit images and their channels; palettes and 16 bits are not read. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly colorType: number;
  /** Bytes per pixel, one per channel. */
  readonly channels: number;
  /** Whether the last channel is alpha. */
  readonly alpha: boolean;
  /** The colour a `tRNS` chunk makes fully transparent, one value per channel; none without one. */
  readonly transparent?: readonly number[];
}

/** Reads an IHDR chunk's data. */
export function parseHeader(data: Uint8Array): PngHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength !== 13) throw new UnsupportedPngError('broken header');
  const [bitDepth, colorType, compression, filterMethod, interlace] = [8, 9, 10, 11, 12].map((at) =>
    view.getUint8(at),
  );
  if (compression !== 0 || filterMethod !== 0) {
    throw new UnsupportedPngError(
      `compression ${String(compression)}, filter method ${String(filterMethod)}`,
    );
  }
  const channels = CHANNELS[colorType ?? -1];
  if (bitDepth !== 8 || channels === undefined) {
    throw new UnsupportedPngError(
      `bit depth ${String(bitDepth)}, colour type ${String(colorType)}`,
    );
  }
  if (interlace !== 0) throw new UnsupportedPngError('interlaced');
  return {
    width: view.getUint32(0),
    height: view.getUint32(4),
    colorType: colorType ?? 0,
    channels,
    alpha: colorType === 4 || colorType === 6,
  };
}

/**
 * The header with the colour the `tRNS` chunk's data makes transparent. Images
 * with alpha have no use for one; values above 255 match no 8-bit pixel.
 */
export function withTransparency(header: PngHeader, data: Uint8Array): PngHeader {
  if (header.alpha) return header;
  if (data.byteLength !== header.channels * 2) {
    throw new UnsupportedPngError(`transparency for colour type ${String(header.colorType)}`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const transparent = Array.from({ length: header.channels }, (_, at) => view.getUint16(at * 2));
  return transparent.some((value) => value > 255) ? header : { ...header, transparent };
}

/** The colour type of the scaled copy: one with alpha when a colour of the source is transparent. */
export function scaledColorType({ colorType, transparent }: PngHeader): number {
  if (!transparent) return colorType;
  return colorType === 0 ? 4 : 6;
}

/** One chunk as the file stores it: length, type, data and checksum. */
export function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.byteLength, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(data, crc32(head.subarray(4))), 0);
  return Buffer.concat([head, data, tail]);
}

/** The IHDR chunk of an 8-bit, non-interlaced image. */
export function headerChunk({
  width,
  height,
  colorType,
}: Pick<PngHeader, 'width' | 'height' | 'colorType'>): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);
  data.writeUInt8(colorType, 9);
  return chunk('IHDR', data);
}

/** Chunks that say how to show the colours, or the pixel size, which the scaled copy keeps. */
export const KEPT_CHUNKS: ReadonlySet<string> = new Set(['iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs']);

/** A chunk read from the source, to write again. */
export interface KeptChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

type Size = Pick<PngHeader, 'width' | 'height'>;

/**
 * The kept chunk for the scaled image: pixels per unit in `pHYs` shrink with the
 * image, so it prints the same size; the colour chunks stay as they were.
 */
export function keptChunkFor({ type, data }: KeptChunk, from: Size, to: Size): Buffer {
  if (type !== 'pHYs' || data.byteLength !== 9) return chunk(type, data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const scaled = Buffer.from(data);
  scaled.writeUInt32BE(Math.max(1, Math.round((view.getUint32(0) * to.width) / from.width)), 0);
  scaled.writeUInt32BE(Math.max(1, Math.round((view.getUint32(4) * to.height) / from.height)), 4);
  return chunk(type, scaled);
}

/** The kept chunk for the turned image: `pHYs` swaps its pixels per unit across and down. */
export function turnedChunk({ type, data }: KeptChunk): Buffer {
  if (type !== 'pHYs' || data.byteLength !== 9) return chunk(type, data);
  const turned = Buffer.from(data);
  turned.set(data.subarray(4, 8), 0);
  turned.set(data.subarray(0, 4), 4);
  return chunk(type, turned);
}

/** The `tRNS` chunk naming the header's transparent colour; none without one. */
export function transparencyChunks({ transparent }: PngHeader): Buffer[] {
  if (!transparent) return [];
  const data = Buffer.alloc(transparent.length * 2);
  transparent.forEach((value, at) => data.writeUInt16BE(value, at * 2));
  return [chunk('tRNS', data)];
}
