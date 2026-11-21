import { createReadStream, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createDeflate, createInflate } from 'node:zlib';
import { UnsupportedPngError } from '../errors.js';
import { chunk, parseHeader, PNG_SIGNATURE, type PngHeader } from './chunks.js';
import { bestFiltered } from './filters.js';
import { ImageDataReader } from './image-data-reader.js';
import { PngWriter } from './png-writer.js';
import { ScanlineDecoder } from './scanline-decoder.js';

/** One PNG to lay onto white: where it is read from and written to. */
export interface FlattenJob {
  readonly source: string;
  readonly target: string;
}

/** The background a see-through pixel is laid on, one value for every channel. */
const BACKGROUND = 255;

/**
 * Writes the 8-bit PNG at `source` with every pixel opaque, laid on white, a
 * scanline at a time: RGB for colour, grey for grey. Colour profile and pixel
 * size chunks are carried over; the `tRNS` chunk is not, as nothing is see-through.
 */
export async function flattenPngFile(job: FlattenJob, signal: AbortSignal): Promise<void> {
  let header: PngHeader | undefined;
  const reader = new ImageDataReader((read) => {
    header = read;
  });
  await pipeline(
    createReadStream(job.source),
    reader,
    createInflate(),
    new ScanlineDecoder(() => header),
    new OpaqueLines(() => header),
    createDeflate({ level: constants.Z_BEST_COMPRESSION, memLevel: 9 }),
    new PngWriter(
      () =>
        header
          ? { width: header.width, height: header.height, colorType: flatColorType(header) }
          : { width: 0, height: 0, colorType: 0 },
      () => reader.kept.map(({ type, data }) => chunk(type, data)),
    ),
    createWriteStream(job.target, { mode: 0o600 }),
    { signal },
  );
}

/** Grey stays grey and colour becomes RGB, both without alpha. */
function flatColorType({ colorType }: PngHeader): number {
  return colorType === 0 || colorType === 4 ? 0 : 2;
}

/**
 * Takes an image's plain scanlines and passes on the same lines laid on white,
 * each filtered as it compresses best: a pixel with alpha is mixed with white
 * by its alpha, and one of the colour a `tRNS` chunk names becomes white.
 */
class OpaqueLines extends Transform {
  private held: Buffer = Buffer.alloc(0);
  private previous: Uint8Array = new Uint8Array(0);

  constructor(private readonly header: () => PngHeader | undefined) {
    super();
  }

  override _transform(bytes: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    const source = this.header();
    if (!source) {
      done(new UnsupportedPngError('no header'));
      return;
    }
    const stride = source.width * source.channels;
    if (stride === 0) {
      done(new UnsupportedPngError('an empty image'));
      return;
    }
    this.held = this.held.length === 0 ? bytes : Buffer.concat([this.held, bytes]);
    let at = 0;
    for (; at + stride <= this.held.length; at += stride) {
      this.pushLine(source, this.held.subarray(at, at + stride));
    }
    this.held = this.held.subarray(at);
    done();
  }

  override _flush(done: TransformCallback): void {
    done(this.held.length === 0 ? null : new UnsupportedPngError('a scanline ends early'));
  }

  private pushLine(source: PngHeader, line: Uint8Array): void {
    const opaque = opaqueLine(source, line);
    const channels = flatColorType(source) === 0 ? 1 : 3;
    if (this.previous.length !== opaque.length) this.previous = new Uint8Array(opaque.length);
    this.push(Buffer.from(bestFiltered(opaque, this.previous, channels)));
    this.previous = opaque;
  }
}

/** One scanline of `source` laid on white, without alpha. */
function opaqueLine(source: PngHeader, line: Uint8Array): Uint8Array {
  const { width, channels, alpha, transparent } = source;
  const colours = alpha ? channels - 1 : channels;
  const out = new Uint8Array(width * colours);
  for (let x = 0; x < width; x += 1) {
    const from = x * channels;
    const to = x * colours;
    if (alpha) {
      const a = line[from + colours] ?? 0;
      for (let c = 0; c < colours; c += 1) {
        const value = line[from + c] ?? 0;
        out[to + c] = Math.round((value * a + BACKGROUND * (255 - a)) / 255);
      }
      continue;
    }
    const clear =
      transparent !== undefined && transparent.every((value, c) => line[from + c] === value);
    for (let c = 0; c < colours; c += 1) {
      out[to + c] = clear ? BACKGROUND : (line[from + c] ?? 0);
    }
  }
  return out;
}

/** The size of an IHDR chunk's data. */
const HEADER_LENGTH = 13;

/**
 * Whether the PNG at `path` can show anything see-through that this flattener
 * can lay on white: it has an alpha channel or a `tRNS` chunk. PNGs the decoder
 * does not read, e.g. 16-bit or palette ones, count as opaque and are sent as
 * they are. Only the chunk heads before the image data are read.
 */
export async function pngMayBeTransparent(path: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(HEADER_LENGTH);
    const read = async (length: number, position: number): Promise<Buffer> => {
      const { bytesRead } = await file.read(head, 0, length, position);
      if (bytesRead < length) throw new UnsupportedPngError('the file ends early');
      return head.subarray(0, length);
    };
    if (!(await read(PNG_SIGNATURE.length, 0)).equals(PNG_SIGNATURE)) {
      throw new UnsupportedPngError('not a PNG');
    }
    for (let at = PNG_SIGNATURE.length; ;) {
      const chunkHead = await read(8, at);
      const length = chunkHead.readUInt32BE(0);
      const type = chunkHead.toString('ascii', 4, 8);
      if (type === 'tRNS') return true;
      if (type === 'IDAT' || type === 'IEND') return false;
      if (type === 'IHDR') {
        const header = decodableHeader(await read(Math.min(length, HEADER_LENGTH), at + 8));
        if (!header) return false;
        if (header.alpha) return true;
      }
      at += 12 + length;
    }
  } finally {
    await file.close();
  }
}

/** The header of a PNG the decoder reads; none for one it refuses. */
function decodableHeader(data: Uint8Array): PngHeader | undefined {
  try {
    return parseHeader(data);
  } catch (error) {
    if (error instanceof UnsupportedPngError) return undefined;
    throw error;
  }
}
