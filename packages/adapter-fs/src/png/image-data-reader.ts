import { Transform, type TransformCallback } from 'node:stream';
import { crc32 } from 'node:zlib';
import {
  KEPT_CHUNKS,
  parseHeader,
  PNG_SIGNATURE,
  withTransparency,
  type KeptChunk,
  type PngHeader,
} from './chunks.js';
import { UnsupportedPngError } from '../errors.js';

type ReaderState = 'signature' | 'head' | 'data' | 'checksum' | 'end';

/** The longest `tRNS` chunk read: an RGB image's three 16-bit values. */
const MAX_TRANSPARENCY_BYTES = 6;

/** Kept chunks larger than this, e.g. an outsized colour profile, are left out. */
export const MAX_KEPT_CHUNK_BYTES = 1024 * 1024;

/**
 * Takes a PNG file's bytes and passes on the compressed image data, holding
 * no image data itself. Reports the header, with the colour a `tRNS` chunk
 * makes transparent, as the image data starts, and keeps the chunks on colour
 * and pixel size, the first of each type and up to {@link MAX_KEPT_CHUNK_BYTES}
 * each, for the scaled copy.
 */
export class ImageDataReader extends Transform {
  /** The source's colour and pixel size chunks, all read before its image data. */
  readonly kept: KeptChunk[] = [];
  private keptData: Buffer[] = [];
  /** Whether the current chunk is one to keep. */
  private keeping = false;
  private state: ReaderState = 'signature';
  private held = Buffer.alloc(0);
  private type = '';
  private remaining = 0;
  /** The checksum of the current chunk's type and data so far. */
  private crc = 0;
  private headerData: Buffer[] = [];
  private transparencyData: Buffer[] = [];
  private transparencyRead = false;
  private header: PngHeader | undefined;
  private reported = false;

  constructor(private readonly onHeader: (header: PngHeader) => void) {
    super();
  }

  override _transform(bytes: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    try {
      this.consume(bytes);
      done();
    } catch (error) {
      done(error as Error);
    }
  }

  override _flush(done: TransformCallback): void {
    done(this.state === 'end' ? null : new UnsupportedPngError('the file ends early'));
  }

  private consume(bytes: Buffer): void {
    let rest = bytes;
    while (rest.length > 0 && this.state !== 'end') {
      if (this.state === 'data') {
        const part = rest.subarray(0, this.remaining);
        this.pass(part);
        this.remaining -= part.length;
        rest = rest.subarray(part.length);
        if (this.remaining === 0) this.state = 'checksum';
        continue;
      }
      const wanted = this.state === 'checksum' ? 4 : 8;
      const missing = wanted - this.held.length;
      this.held = Buffer.concat([this.held, rest.subarray(0, missing)]);
      rest = rest.subarray(missing);
      if (this.held.length === wanted) this.next(this.held);
    }
  }

  private next(fixed: Buffer): void {
    this.held = Buffer.alloc(0);
    if (this.state === 'signature') {
      if (!fixed.equals(PNG_SIGNATURE)) throw new UnsupportedPngError('not a PNG');
      this.state = 'head';
    } else if (this.state === 'checksum') {
      if (fixed.readUInt32BE(0) !== this.crc) {
        throw new UnsupportedPngError(`the ${this.type} chunk is damaged`);
      }
      if (this.type === 'IHDR') this.header = parseHeader(Buffer.concat(this.headerData));
      if (this.type === 'tRNS') this.readTransparency();
      if (this.keeping) {
        this.kept.push({ type: this.type, data: Buffer.concat(this.keptData) });
        this.keptData = [];
      }
      this.state = this.type === 'IEND' ? 'end' : 'head';
    } else {
      this.remaining = fixed.readUInt32BE(0);
      this.type = fixed.toString('ascii', 4, 8);
      this.crc = crc32(fixed.subarray(4, 8));
      this.keeping =
        KEPT_CHUNKS.has(this.type) &&
        this.remaining <= MAX_KEPT_CHUNK_BYTES &&
        !this.kept.some(({ type }) => type === this.type);
      this.checkOrder();
      if (this.type === 'IHDR' && this.remaining !== 13) {
        throw new UnsupportedPngError('broken header');
      }
      // Grey and RGB name at most three 16-bit values; a longer one is not held in memory.
      if (this.type === 'tRNS' && this.remaining > MAX_TRANSPARENCY_BYTES) {
        throw new UnsupportedPngError('transparency chunk too long');
      }
      if (this.type === 'IDAT') this.reportHeader();
      this.state = this.remaining === 0 ? 'checksum' : 'data';
    }
  }

  private pass(part: Buffer): void {
    this.crc = crc32(part, this.crc);
    if (this.type === 'IDAT') this.push(part);
    else if (this.type === 'IHDR') this.headerData.push(part);
    else if (this.type === 'tRNS') this.transparencyData.push(part);
    else if (this.keeping) this.keptData.push(part);
  }

  /** The header comes first and once; transparency once, before the image data. */
  private checkOrder(): void {
    if (this.type === 'IHDR' ? this.header : !this.header) {
      throw new UnsupportedPngError(this.header ? 'a second header' : 'a chunk before the header');
    }
    if (this.type === 'tRNS' && (this.reported || this.transparencyRead)) {
      throw new UnsupportedPngError('transparency after the image data or twice');
    }
  }

  private readTransparency(): void {
    this.transparencyRead = true;
    if (!this.header) return;
    this.header = withTransparency(this.header, Buffer.concat(this.transparencyData));
  }

  private reportHeader(): void {
    if (this.reported || !this.header) return;
    this.reported = true;
    this.onHeader(this.header);
  }
}
