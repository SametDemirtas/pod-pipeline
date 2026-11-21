import { deflateSync, inflateSync } from 'node:zlib';
import { filtered, unfilter } from '../png/filters.js';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid, fully decodable greyscale PNG. */
export function png(width: number, height: number, shade = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(0, 9);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, shade)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A JFIF header with a frame size and an optional EXIF orientation tag. */
export function jpeg(width: number, height: number, orientation?: number): Buffer {
  const segments: Buffer[] = [
    Buffer.from('ffd8', 'hex'),
    Buffer.from('ffe000104a46494600010100000100010000', 'hex'),
  ];
  if (orientation !== undefined) {
    const entry = '4d4d002a000000080001011200030000000100';
    const value = orientation.toString(16).padStart(2, '0');
    const tiff = Buffer.from(`${entry}${value}000000000000`, 'hex');
    const payload = Buffer.concat([Buffer.from('457869660000', 'hex'), tiff]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    segments.push(Buffer.from('ffe1', 'hex'), length, payload);
  }
  const frame = Buffer.alloc(17);
  frame.writeUInt16BE(17, 0);
  frame.writeUInt8(8, 2);
  frame.writeUInt16BE(height, 3);
  frame.writeUInt16BE(width, 5);
  frame.writeUInt8(3, 7);
  segments.push(Buffer.from('ffc0', 'hex'), frame, Buffer.from('ffd9', 'hex'));
  return Buffer.concat(segments);
}

/** A JPEG whose frame header sits behind `metadataBytes` of APP2 metadata. */
export function jpegWithMetadata(width: number, height: number, metadataBytes: number): Buffer {
  const plain = jpeg(width, height);
  const segments: Buffer[] = [];
  for (let remaining = metadataBytes; remaining > 0; remaining -= 65_000) {
    const payload = Buffer.alloc(Math.min(65_000, remaining), 0x20);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    segments.push(Buffer.from('ffe2', 'hex'), length, payload);
  }
  return Buffer.concat([plain.subarray(0, 20), ...segments, plain.subarray(20)]);
}

/** Colour types and their channels, as the PNG header names them. */
const CHANNELS_OF: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly colorType: number;
  /** Row after row, channel after channel. */
  readonly data: Uint8Array;
}

/**
 * A PNG of `pixels`, each scanline under the filter `filterOf` names, its
 * compressed data split over several IDAT chunks as large files often are.
 */
export function pngOf(
  pixels: Pixels,
  filterOf: (row: number) => number = (row) => row % 5,
): Buffer {
  const channels = CHANNELS_OF[pixels.colorType] ?? 1;
  const stride = pixels.width * channels;
  const lines: Uint8Array[] = [];
  let previous: Uint8Array = new Uint8Array(stride);
  for (let row = 0; row < pixels.height; row += 1) {
    const line = pixels.data.subarray(row * stride, (row + 1) * stride);
    lines.push(filtered(filterOf(row), line, previous, channels));
    previous = line;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(pixels.width, 0);
  header.writeUInt32BE(pixels.height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(pixels.colorType, 9);
  const data = deflateSync(Buffer.concat(lines));
  const third = Math.ceil(data.length / 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from('Comment\0made in a test')),
    ...[0, 1, 2].map((part) => chunk('IDAT', data.subarray(part * third, (part + 1) * third))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The pixels of an 8-bit, non-interlaced PNG. */
export function pixelsOf(file: Buffer): Pixels {
  const parts: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.toString('ascii', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body.readUInt8(9);
    }
    if (type === 'IDAT') parts.push(body);
    at += length + 12;
  }
  const channels = CHANNELS_OF[colorType] ?? 1;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const data = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row += 1) {
    const line = Uint8Array.from(raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)));
    unfilter(raw[row * (stride + 1)] ?? 0, line, previous, channels);
    data.set(line, row * stride);
    previous = line;
  }
  return { width, height, colorType, data };
}
