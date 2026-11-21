import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { png } from '../testing/test-images.js';
import { chunk } from './chunks.js';
import { ImageDataReader, MAX_KEPT_CHUNK_BYTES } from './image-data-reader.js';
import { scalePngFile } from './scale-job.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-png-read-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Reads a PNG through the reader, which checks every chunk's checksum. */
async function read(bytes: Buffer): Promise<ImageDataReader> {
  const reader = new ImageDataReader(() => undefined);
  const sink = new Writable({
    write: (_part, _encoding, done) => {
      done();
    },
  });
  await pipeline(Readable.from([bytes]), reader, sink);
  return reader;
}

/** The PNG with `extra` chunks right after its header. */
const withChunks = (source: Buffer, extra: readonly Buffer[]) =>
  Buffer.concat([source.subarray(0, 33), ...extra, source.subarray(33)]);

describe('ImageDataReader', () => {
  it('reads a scaled copy back, its kept chunks intact', async () => {
    const source = join(dir, 'source.png');
    const target = join(dir, 'scaled.png');
    writeFileSync(source, withChunks(png(40, 20, 90), [chunk('sRGB', Uint8Array.of(0))]));

    await scalePngFile(
      { source, target, size: { width: 10, height: 5 } },
      new AbortController().signal,
    );

    const reader = await read(readFileSync(target));
    expect(reader.kept).toEqual([{ type: 'sRGB', data: Buffer.of(0) }]);
  });

  it('leaves out a kept chunk larger than it holds', async () => {
    const profile = chunk('iCCP', new Uint8Array(MAX_KEPT_CHUNK_BYTES + 1));
    const gamma = chunk('gAMA', Uint8Array.of(0, 0, 0xb1, 0x8f));

    const reader = await read(withChunks(png(4, 4), [profile, gamma]));

    expect(reader.kept.map(({ type }) => type)).toEqual(['gAMA']);
  });

  it('keeps only the first chunk of each type', async () => {
    const first = chunk('gAMA', Uint8Array.of(0, 0, 0xb1, 0x8f));
    const second = chunk('gAMA', Uint8Array.of(0, 1, 0x86, 0xa0));

    const reader = await read(withChunks(png(4, 4), [first, second]));

    expect(reader.kept).toEqual([{ type: 'gAMA', data: Buffer.of(0, 0, 0xb1, 0x8f) }]);
  });
});
