import { Transform, type TransformCallback } from 'node:stream';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '@pod/core';
import { UnsupportedPngError } from '../errors.js';
import type { PngHeader } from './chunks.js';
import { bestFiltered, unfilter } from './filters.js';

/**
 * Takes the inflated scanlines of an image and passes on those of a smaller
 * one, each filtered as it compresses best. Each output pixel is the average
 * of the source pixels it covers, weighted by their alpha where there is one,
 * so transparent pixels lend no colour to the edges. Pixels of the colour a
 * `tRNS` chunk makes transparent count as transparent, and the scaled copy
 * gets an alpha channel for them. Where all are transparent, their plain
 * average is kept.
 * Known limit: it averages gamma-encoded values, not linear light, so fine
 * light and dark detail comes out a little dark.
 */
export class ScanlineScaler extends Transform {
  private source: PngHeader | undefined;
  private line = new Uint8Array(0);
  private previous = new Uint8Array(0);
  /** Bytes of the current scanline received, its filter byte first. */
  private filled = 0;
  private lineFilter = 0;
  private sourceRow = 0;
  private outputRow = 0;
  private columnOf = new Uint32Array(0);
  private sums = new Float64Array(0);
  /** Colour sums without alpha weights, for output pixels covering only transparent ones. */
  private plain = new Float64Array(0);
  private weights = new Float64Array(0);
  private counts = new Float64Array(0);
  private previousOutput = new Uint8Array(0);
  /** Colour channels of the source, and channels of the output: colour and maybe alpha. */
  private colour = 0;
  private outChannels = 0;

  constructor(
    private readonly header: () => PngHeader | undefined,
    private readonly size: { readonly width: number; readonly height: number },
  ) {
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
    const finished = this.source && this.sourceRow === this.source.height;
    if (finished) this.flushRow();
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
    const { width, height } = this.size;
    if (width < 1 || height < 1 || width > source.width || height > source.height) {
      throw new RangeError(
        `Cannot scale ${String(source.width)} × ${String(source.height)} to ${String(width)} × ${String(height)}`,
      );
    }
    this.source = source;
    this.colour = source.alpha ? source.channels - 1 : source.channels;
    this.outChannels = source.alpha || source.transparent ? this.colour + 1 : this.colour;
    this.line = new Uint8Array(source.width * source.channels);
    this.previous = new Uint8Array(this.line.length);
    this.columnOf = Uint32Array.from({ length: source.width }, (_, x) =>
      Math.floor((x * width) / source.width),
    );
    this.sums = new Float64Array(width * this.outChannels);
    this.plain = new Float64Array(width * this.outChannels);
    this.weights = new Float64Array(width);
    this.counts = new Float64Array(width);
    this.previousOutput = new Uint8Array(width * this.outChannels);
    return source;
  }

  private consume(bytes: Buffer): void {
    const source = this.source ?? this.start();
    let at = 0;
    while (at < bytes.length && this.sourceRow < source.height) {
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
    const row = Math.floor((this.sourceRow * this.size.height) / source.height);
    if (row !== this.outputRow) this.flushRow();
    this.add(source);
    [this.previous, this.line] = [this.line, this.previous];
    this.filled = 0;
    this.sourceRow += 1;
  }

  private add({ width, channels, alpha, transparent }: PngHeader): void {
    const { colour, outChannels } = this;
    const hasAlpha = outChannels > colour;
    for (let x = 0; x < width; x += 1) {
      const column = this.columnOf[x] ?? 0;
      const from = x * channels;
      const to = column * outChannels;
      const weight = alpha
        ? (this.line[from + colour] ?? 0)
        : transparent
          ? this.opacity(from, transparent)
          : 1;
      for (let c = 0; c < colour; c += 1) {
        const value = this.line[from + c] ?? 0;
        this.sums[to + c] = (this.sums[to + c] ?? 0) + value * weight;
        this.plain[to + c] = (this.plain[to + c] ?? 0) + value;
      }
      if (hasAlpha) this.sums[to + colour] = (this.sums[to + colour] ?? 0) + weight;
      this.weights[column] = (this.weights[column] ?? 0) + weight;
      this.counts[column] = (this.counts[column] ?? 0) + 1;
    }
  }

  /** 0 for a pixel of the transparent colour, else fully opaque. */
  private opacity(from: number, transparent: readonly number[]): number {
    for (let c = 0; c < transparent.length; c += 1) {
      if (this.line[from + c] !== transparent[c]) return 255;
    }
    return 0;
  }

  /** Passes on the finished output scanline and starts the next. */
  private flushRow(): void {
    if (!this.source) return;
    const { colour, outChannels } = this;
    const hasAlpha = outChannels > colour;
    const out = new Uint8Array(this.size.width * outChannels);
    for (let column = 0; column < this.size.width; column += 1) {
      const weight = this.weights[column] ?? 0;
      const count = this.counts[column] ?? 1;
      const at = column * outChannels;
      for (let c = 0; c < colour; c += 1) {
        out[at + c] = Math.round(
          weight > 0 ? (this.sums[at + c] ?? 0) / weight : (this.plain[at + c] ?? 0) / count,
        );
      }
      if (hasAlpha) out[at + colour] = Math.round((this.sums[at + colour] ?? 0) / count);
    }
    this.push(bestFiltered(out, this.previousOutput, outChannels));
    this.previousOutput = out;
    this.sums.fill(0);
    this.plain.fill(0);
    this.weights.fill(0);
    this.counts.fill(0);
    this.outputRow += 1;
  }
}
