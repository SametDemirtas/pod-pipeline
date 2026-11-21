import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QuarterTurn } from '@pod/core';
import { ImageHeaderInspector } from '../image-header-inspector.js';
import { inProcessWorker } from '../testing/in-process-worker.js';
import { pixelsOf, pngOf, type Pixels } from '../testing/test-images.js';
import { PngWorkFailedError, PngWorkStoppedError } from '../errors.js';
import { chunk } from './chunks.js';
import { rotatePngFile } from './rotate-job.js';
import { WorkerPngRotator } from './worker-png-rotator.js';

let dir: string;
let made: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-turn-'));
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

const rotator = () => new WorkerPngRotator(newFile, inProcessWorker, new ImageHeaderInspector());

function write(name: string, bytes: Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Every byte different, so a pixel in the wrong place shows. */
function image(width: number, height: number, colorType: number): Pixels {
  const channels = CHANNELS[colorType] ?? 1;
  const data = Uint8Array.from({ length: width * height * channels }, (_, at) => (at * 7) % 251);
  return { width, height, colorType, data };
}

/** The pixels turned a quarter clockwise, or the other way, one at a time. */
function turned(source: Pixels, turn: QuarterTurn): Pixels {
  const { width, height, colorType } = source;
  const channels = CHANNELS[colorType] ?? 1;
  const data = new Uint8Array(source.data.length);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < height; x += 1) {
      const [fromX, fromY] = turn === 90 ? [y, height - 1 - x] : [width - 1 - y, x];
      for (let c = 0; c < channels; c += 1) {
        data[(y * height + x) * channels + c] =
          source.data[(fromY * width + fromX) * channels + c] ?? 0;
      }
    }
  }
  return { width: height, height: width, colorType, data };
}

/** The types of the chunks of a PNG file, in order, with their data. */
function chunksOf(file: Buffer): { type: string; data: Buffer }[] {
  const found: { type: string; data: Buffer }[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    found.push({
      type: file.toString('ascii', at + 4, at + 8),
      data: file.subarray(at + 8, at + 8 + length),
    });
    at += length + 12;
  }
  return found;
}

describe('WorkerPngRotator', () => {
  it.each([
    [90, 0],
    [270, 0],
    [90, 2],
    [270, 6],
    [90, 4],
  ] as const)('turns %i° with every pixel in place, colour type %i', async (turn, colorType) => {
    const source = image(5, 3, colorType);

    const result = await rotator().rotate(write('in.png', pngOf(source)), turn);

    expect(result).toMatchObject({ width: 3, height: 5 });
    const written = readFileSync(result.absolutePath);
    expect(result.byteSize).toBe(written.length);
    expect(pixelsOf(written)).toEqual(turned(source, turn));
  });

  it('removes the plain pixels it held meanwhile', async () => {
    const result = await rotator().rotate(write('in.png', pngOf(image(4, 2, 2))), 90);

    expect(readdirSync(dir).sort()).toEqual(['in.png', 'out-1.png']);
    await result.dispose();
  });

  it('keeps the colour profile and the transparent colour, and swaps the pixel size', async () => {
    const source = image(3, 2, 2);
    const plain = pngOf(source);
    const pixelSize = Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0e, 0xc4, 1]);
    const transparent = Buffer.from([0, 1, 0, 2, 0, 3]);
    const extra = [
      chunk('sRGB', Buffer.from([0])),
      chunk('pHYs', pixelSize),
      chunk('tRNS', transparent),
    ];
    const withChunks = Buffer.concat([plain.subarray(0, 33), ...extra, plain.subarray(33)]);

    const result = await rotator().rotate(write('in.png', withChunks), 270);

    const chunks = chunksOf(readFileSync(result.absolutePath));
    const types = chunks.map(({ type }) => type).filter((type, at, all) => all[at - 1] !== type);
    expect(types).toEqual(['IHDR', 'sRGB', 'pHYs', 'tRNS', 'IDAT', 'IEND']);
    expect(chunks[2]?.data).toEqual(Buffer.from([0, 0, 0x0e, 0xc4, 0, 0, 0x0b, 0x13, 1]));
    expect(chunks[3]?.data).toEqual(transparent);
    expect(pixelsOf(readFileSync(result.absolutePath))).toEqual(turned(source, 270));
  });

  it('refuses a file that is not a PNG and leaves no file behind', async () => {
    await expect(rotator().rotate(write('in.png', Buffer.from('not a png')), 90)).rejects.toThrow(
      PngWorkFailedError,
    );
    expect(readdirSync(dir)).toEqual(['in.png']);
  });

  it('stops before starting when asked to', async () => {
    const stop = new AbortController();
    stop.abort();

    await expect(
      rotator().rotate(write('in.png', pngOf(image(2, 2, 0))), 90, stop.signal),
    ).rejects.toThrow(PngWorkStoppedError);
  });
});

describe('rotatePngFile', () => {
  it.each([90, 270] as const)('turns %i° a band of columns at a time', async (turn) => {
    const source = image(7, 4, 6);
    const job = {
      source: write('in.png', pngOf(source)),
      scratch: join(dir, 'pixels'),
      target: join(dir, 'out.png'),
      turn,
      // Two columns of four RGBA pixels: the image takes four bands, the last one narrower.
      bandBytes: 2 * 4 * 4,
    };

    await rotatePngFile(job, new AbortController().signal);

    expect(pixelsOf(readFileSync(job.target))).toEqual(turned(source, turn));
  });
});
