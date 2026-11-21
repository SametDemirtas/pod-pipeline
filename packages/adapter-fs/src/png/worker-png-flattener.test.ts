import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inProcessWorker } from '../testing/in-process-worker.js';
import { jpeg, pixelsOf, pngOf, type Pixels } from '../testing/test-images.js';
import { PngWorkFailedError, PngWorkStoppedError } from '../errors.js';
import { chunk } from './chunks.js';
import { flattenPngFile, pngMayBeTransparent } from './flatten-job.js';
import { WorkerPngFlattener } from './worker-png-flattener.js';

let dir: string;
let made: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-flat-'));
  made = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const newFile = () => {
  made += 1;
  const absolutePath = join(dir, `out-${String(made)}.png`);
  return Promise.resolve({
    absolutePath,
    dispose: () => {
      rmSync(absolutePath, { force: true });
      return Promise.resolve();
    },
  });
};

const flattener = () => new WorkerPngFlattener(newFile, inProcessWorker);

function write(name: string, bytes: Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

const png = (path: string) => ({ absolutePath: path, mimeType: 'image/png' });

/** A PNG with `extra` chunks right after its header. */
function withChunks(file: Buffer, extra: readonly Buffer[]): Buffer {
  return Buffer.concat([file.subarray(0, 33), ...extra, file.subarray(33)]);
}

describe('WorkerPngFlattener', () => {
  it('lays colour with alpha onto white, mixing by the alpha', async () => {
    // Opaque red, see-through blue, and green at half.
    const source: Pixels = {
      width: 3,
      height: 1,
      colorType: 6,
      data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 128]),
    };

    const flat = await flattener().flatten(png(write('in.png', pngOf(source))));

    expect(flat?.mimeType).toBe('image/png');
    expect(pixelsOf(readFileSync(flat?.absolutePath ?? ''))).toEqual({
      width: 3,
      height: 1,
      colorType: 2,
      data: Uint8Array.from([255, 0, 0, 255, 255, 255, 127, 255, 127]),
    });
  });

  it('lays grey with alpha onto white as grey', async () => {
    const source: Pixels = {
      width: 2,
      height: 2,
      colorType: 4,
      data: Uint8Array.from([10, 255, 10, 0, 0, 51, 200, 255]),
    };

    const flat = await flattener().flatten(png(write('in.png', pngOf(source))));

    expect(pixelsOf(readFileSync(flat?.absolutePath ?? ''))).toEqual({
      width: 2,
      height: 2,
      colorType: 0,
      data: Uint8Array.from([10, 255, 204, 200]),
    });
  });

  it('turns the transparent colour white and keeps the colour profile', async () => {
    const source: Pixels = {
      width: 2,
      height: 1,
      colorType: 2,
      data: Uint8Array.from([1, 2, 3, 9, 9, 9]),
    };
    const file = withChunks(pngOf(source), [
      chunk('sRGB', Buffer.from([0])),
      chunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3])),
    ]);

    const flat = await flattener().flatten(png(write('in.png', file)));

    const written = readFileSync(flat?.absolutePath ?? '');
    expect(pixelsOf(written).data).toEqual(Uint8Array.from([255, 255, 255, 9, 9, 9]));
    expect(written.includes(Buffer.from('sRGB'))).toBe(true);
    expect(written.includes(Buffer.from('tRNS'))).toBe(false);
  });

  it('leaves JPEGs and PNGs without transparency as they are', async () => {
    const opaque = pngOf({ width: 2, height: 1, colorType: 2, data: new Uint8Array(6) });

    expect(await flattener().flatten(png(write('in.png', opaque)))).toBeUndefined();
    expect(
      await flattener().flatten({
        absolutePath: write('in.jpg', jpeg(4, 3)),
        mimeType: 'image/jpeg',
      }),
    ).toBeUndefined();
    expect(made).toBe(0);
  });

  it('refuses a PNG it cannot read and leaves no file behind', async () => {
    const broken = pngOf({ width: 2, height: 2, colorType: 6, data: new Uint8Array(16) });

    await expect(
      flattener().flatten(png(write('in.png', broken.subarray(0, broken.length - 20)))),
    ).rejects.toThrow(PngWorkFailedError);
    expect(readdirSync(dir)).toEqual(['in.png']);
  });

  it('stops before starting when asked to', async () => {
    const stop = new AbortController();
    stop.abort();
    const source = pngOf({ width: 1, height: 1, colorType: 6, data: new Uint8Array(4) });

    await expect(flattener().flatten(png(write('in.png', source)), stop.signal)).rejects.toThrow(
      PngWorkStoppedError,
    );
  });

  it('starts no worker when stopped while its file is being made', async () => {
    const stop = new AbortController();
    const startWorker = vi.fn(inProcessWorker);
    const stopping = () => {
      stop.abort();
      return newFile();
    };
    const source = pngOf({ width: 1, height: 1, colorType: 6, data: new Uint8Array(4) });

    await expect(
      new WorkerPngFlattener(stopping, startWorker).flatten(
        png(write('in.png', source)),
        stop.signal,
      ),
    ).rejects.toThrow(PngWorkStoppedError);
    expect(startWorker).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual(['in.png']);
  });
});

describe('pngMayBeTransparent', () => {
  it.each([
    [0, false],
    [2, false],
    [4, true],
    [6, true],
  ])('reads colour type %i as see-through: %s', async (colorType, expected) => {
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType] ?? 1;
    const file = pngOf({ width: 1, height: 1, colorType, data: new Uint8Array(channels) });

    expect(await pngMayBeTransparent(write('in.png', file))).toBe(expected);
  });

  it('finds a transparent colour', async () => {
    const plain = pngOf({ width: 1, height: 1, colorType: 0, data: new Uint8Array(1) });

    const file = withChunks(plain, [chunk('tRNS', Buffer.from([0, 0]))]);

    expect(await pngMayBeTransparent(write('in.png', file))).toBe(true);
  });

  it.each([
    ['a palette with a transparent colour', 8, 3, [chunk('tRNS', Buffer.from([0]))]],
    ['16 bits per channel with alpha', 16, 6, []],
  ])(
    'sends %s as it is, as the decoder does not read it',
    async (_, bitDepth, colorType, extra) => {
      const plain = pngOf({ width: 1, height: 1, colorType: 2, data: new Uint8Array(3) });
      const file = withChunks(plain, extra);
      file.writeUInt8(bitDepth, 24);
      file.writeUInt8(colorType, 25);

      expect(await pngMayBeTransparent(write('in.png', file))).toBe(false);
    },
  );

  it('refuses a file that is not a PNG', async () => {
    await expect(pngMayBeTransparent(write('in.png', Buffer.from('not a png')))).rejects.toThrow(
      'not a PNG',
    );
  });
});

describe('flattenPngFile', () => {
  it('keeps every line of a tall image in place', async () => {
    const width = 300;
    const height = 50;
    const data = Uint8Array.from({ length: width * height * 4 }, (_, at) =>
      at % 4 === 3 ? 255 : (at * 7) % 251,
    );
    const job = {
      source: write('in.png', pngOf({ width, height, colorType: 6, data })),
      target: join(dir, 'out.png'),
    };

    await flattenPngFile(job, new AbortController().signal);

    const expected = data.filter((_, at) => at % 4 !== 3);
    expect(pixelsOf(readFileSync(job.target))).toEqual({
      width,
      height,
      colorType: 2,
      data: Uint8Array.from(expected),
    });
  });
});
