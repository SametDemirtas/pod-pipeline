import { Transform, type TransformCallback } from 'node:stream';
import { chunk, headerChunk, PNG_SIGNATURE, type PngHeader } from './chunks.js';

/** Wraps compressed image data in the chunks of a PNG file, after the header and `extra`. */
export class PngWriter extends Transform {
  private started = false;

  constructor(
    private readonly header: () => Pick<PngHeader, 'width' | 'height' | 'colorType'>,
    private readonly extra: () => readonly Buffer[] = () => [],
  ) {
    super();
  }

  override _transform(bytes: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.begin();
    this.push(chunk('IDAT', bytes));
    done();
  }

  override _flush(done: TransformCallback): void {
    this.begin();
    this.push(chunk('IEND', new Uint8Array(0)));
    done();
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    this.push(Buffer.from(PNG_SIGNATURE));
    this.push(headerChunk(this.header()));
    for (const extra of this.extra()) this.push(extra);
  }
}
