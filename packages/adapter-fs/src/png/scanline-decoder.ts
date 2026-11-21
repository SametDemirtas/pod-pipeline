import { Transform, type TransformCallback } from 'node:stream';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '@pod/core';
import { UnsupportedPngError } from '../errors.js';
import type { PngHeader } from './chunks.js';
import { unfilter } from './filters.js';

/** Takes the inflated scanlines of an image and passes on their pixels, one restored line at a time. */
export class ScanlineDecoder extends Transform {
  private source: PngHeader | undefined;
  private line = new Uint8Array(0);
  private previous = new Uint8Array(0);
  /** Bytes of the current scanline received, its filter byte first. */
  private filled = 0;
  private lineFilter = 0;
  private row = 0;

  constructor(private readonly header: () => PngHeader | undefined) {
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
    const finished = this.source && this.row === this.source.height;
    done(finished ? null : new UnsupportedPngError('the image data ends early'));
  }

  private start(): PngHeader {
    const source = this.header();
    if (!source) throw new UnsupportedPngError('no header');
    if (
      Math.max(source.width, source.height) > MAX_IMAGE_SIDE ||
      source.width * source.height > MAX_IMAGE_PIXELS
    ) {
      throw new UnsupportedPngError(
        `${String(source.width)} × ${String(source.height)} is too large`,
      );
    }
    this.source = source;
    this.line = new Uint8Array(source.width * source.channels);
    this.previous = new Uint8Array(this.line.length);
    return source;
  }

  private consume(bytes: Buffer): void {
    const source = this.source ?? this.start();
    let at = 0;
    while (at < bytes.length && this.row < source.height) {
      if (this.filled === 0) {
        this.lineFilter = bytes[at] ?? 0;
        at += 1;
        this.filled = 1;
        continue;
      }
      const part = bytes.subarray(at, at + this.line.length - (this.filled - 1));
      this.line.set(part, this.filled - 1);
      this.filled += part.length;
      at += part.length;
      if (this.filled - 1 === this.line.length) this.finishLine(source);
    }
  }

  private finishLine(source: PngHeader): void {
    unfilter(this.lineFilter, this.line, this.previous, source.channels);
    this.push(Buffer.from(this.line));
    [this.previous, this.line] = [this.line, this.previous];
    this.filled = 0;
    this.row += 1;
  }
}
