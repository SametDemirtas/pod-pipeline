import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inProcessWorker } from '../testing/in-process-worker.js';
import { pixelsOf, pngOf, type Pixels } from '../testing/test-images.js';
import { PngWorkFailedError, PngWorkStoppedError } from '../errors.js';
import { chunk, PNG_SIGNATURE } from './chunks.js';
import { WorkerPngScaler } from './worker-png-scaler.js';

let dir: string;
let made: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-png-'));
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

const scaler = () => new WorkerPngScaler(newFile, inProcessWorker);

function write(name: string, bytes: Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

function image(
  width: number,
  height: number,
  colorType: number,
  value: (x: number, y: number, c: number) => number,
): Pixels {
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType] ?? 1;
  const data = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < channels; c += 1) data[(y * width + x) * channels + c] = value(x, y, c);
    }
  }
  return { width, height, colorType, data };
}

/** The start of a PNG with the header bytes given and correct checksums; its rows are cut short. */
function withHeader(width: number, height: number, tail: readonly number[]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  Buffer.from(tail).copy(header, 8);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** The PNG with `extra` chunks right after its header. */
const afterHeader = (source: Buffer, ...extra: readonly Buffer[]) =>
  Buffer.concat([source.subarray(0, 33), ...extra, source.subarray(33)]);

/** A `tRNS` chunk naming the 8-bit colour made transparent, 16 bits per value. */
function transparency(...values: readonly number[]): Buffer {
  const data = Buffer.alloc(values.length * 2);
  values.forEach((value, at) => data.writeUInt16BE(value, at * 2));
  return chunk('tRNS', data);
}

/** The chunks of a PNG file, in order. */
function chunksOf(bytes: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = [];
  for (let at = PNG_SIGNATURE.length; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    chunks.push({
      type: bytes.toString('ascii', at + 4, at + 8),
      data: bytes.subarray(at + 8, at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

describe('WorkerPngScaler', () => {
  it('reads a PNG another encoder wrote, and scales it to the pixels a reference decoder reads', async () => {
    // Written by Pillow with its own filters (Sub, then Paeth); the expected pixels
    // of the scaled copy were read back from this scaler's output with Pillow.
    const source = join(import.meta.dirname, 'fixtures', 'pil-rgba-9x7.png');

    const whole = await scaler().scale(source, { width: 9, height: 7 });
    const scaled = await scaler().scale(source, { width: 4, height: 3 });

    const pixels = pixelsOf(readFileSync(whole.absolutePath));
    const pixel = (x: number, y: number) =>
      Array.from(pixels.data.subarray((y * 9 + x) * 4, (y * 9 + x + 1) * 4));
    expect(pixel(0, 0)).toEqual([0, 0, 255, 0]);
    expect(pixel(5, 3)).toEqual([166, 218, 157, 200]);
    expect(pixel(8, 6)).toEqual([18, 250, 85, 255]);
    expect(Array.from(pixelsOf(readFileSync(scaled.absolutePath)).data)).toEqual(EXPECTED_SCALED);
  });

  it('keeps every pixel of an image written at its own size, under any filter', async () => {
    const pixels = image(37, 23, 6, (x, y, c) => (x * 7 + y * 13 + c * 51) % 256);
    const source = write('in.png', pngOf(pixels));

    const result = await scaler().scale(source, { width: 37, height: 23 });

    expect(pixelsOf(readFileSync(result.absolutePath))).toEqual(pixels);
    expect(result).toMatchObject({ width: 37, height: 23 });
    expect(result.byteSize).toBe(readFileSync(result.absolutePath).length);
  });

  it('averages the pixels each output pixel covers', async () => {
    const pixels = image(4, 2, 2, (x, _y, c) => (c === 0 ? x * 60 : 100));
    const source = write(
      'in.png',
      pngOf(pixels, () => 0),
    );

    const result = await scaler().scale(source, { width: 2, height: 1 });

    expect(pixelsOf(readFileSync(result.absolutePath))).toEqual({
      width: 2,
      height: 1,
      colorType: 2,
      data: Uint8Array.from([30, 100, 100, 150, 100, 100]),
    });
  });

  it('lends transparent pixels no colour, and averages their alpha', async () => {
    const pixels: Pixels = {
      width: 2,
      height: 1,
      colorType: 6,
      data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 0]),
    };
    const blank: Pixels = {
      width: 2,
      height: 1,
      colorType: 4,
      data: Uint8Array.from([9, 0, 7, 0]),
    };
    const result = await scaler().scale(write('in.png', pngOf(pixels)), { width: 1, height: 1 });
    const empty = await scaler().scale(write('blank.png', pngOf(blank)), { width: 1, height: 1 });

    expect(pixelsOf(readFileSync(result.absolutePath)).data).toEqual(
      Uint8Array.from([255, 0, 0, 128]),
    );
    expect(pixelsOf(readFileSync(empty.absolutePath)).data).toEqual(Uint8Array.from([8, 0]));
  });

  it('turns the colour a tRNS chunk makes transparent into alpha', async () => {
    const rgb: Pixels = {
      width: 2,
      height: 1,
      colorType: 2,
      data: Uint8Array.from([255, 0, 0, 0, 255, 0]),
    };
    const grey: Pixels = { width: 2, height: 1, colorType: 0, data: Uint8Array.from([9, 200]) };
    const scale = async (name: string, bytes: Buffer) =>
      pixelsOf(
        readFileSync(
          (await scaler().scale(write(name, bytes), { width: 1, height: 1 })).absolutePath,
        ),
      );

    expect(await scale('rgb.png', afterHeader(pngOf(rgb), transparency(0, 255, 0)))).toEqual({
      width: 1,
      height: 1,
      colorType: 6,
      data: Uint8Array.from([255, 0, 0, 128]),
    });
    expect(await scale('grey.png', afterHeader(pngOf(grey), transparency(200)))).toEqual({
      width: 1,
      height: 1,
      colorType: 4,
      data: Uint8Array.from([9, 128]),
    });
    expect(await scale('wide.png', afterHeader(pngOf(grey), transparency(300)))).toEqual({
      width: 1,
      height: 1,
      colorType: 0,
      data: Uint8Array.from([105]),
    });
  });

  it('shrinks a large greyscale image to a thumbnail in uneven steps', async () => {
    const pixels = image(1000, 700, 0, (x) => (x < 500 ? 0 : 200));
    const result = await scaler().scale(write('in.png', pngOf(pixels)), { width: 3, height: 2 });

    expect(pixelsOf(readFileSync(result.absolutePath)).data).toEqual(
      Uint8Array.from([0, 100, 200, 0, 100, 200]),
    );
  });

  it('refuses what it cannot read safely, leaving no file behind', async () => {
    const whole = pngOf(image(8, 8, 2, () => 1));
    const damaged = Buffer.from(whole);
    damaged[40] = (damaged[40] ?? 0) ^ 0xff;
    const longHeader = Buffer.concat([
      PNG_SIGNATURE,
      chunk('IHDR', Buffer.alloc(14)),
      chunk('IEND', new Uint8Array(0)),
    ]);
    const headerless = Buffer.concat([whole.subarray(0, 8), whole.subarray(33)]);
    const ihdr = whole.subarray(8, 33);
    const unknownFilter = Buffer.concat([
      PNG_SIGNATURE,
      chunk('IHDR', Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 0, 0, 0, 0])),
      chunk('IDAT', deflateSync(Buffer.from([7, 1, 2, 7, 3, 4]))),
      chunk('IEND', new Uint8Array(0)),
    ]);
    const lateTransparency = Buffer.concat([
      whole.subarray(0, whole.length - 12),
      transparency(1, 1, 1),
      whole.subarray(whole.length - 12),
    ]);
    const cases: [Buffer, { width: number; height: number }, RegExp][] = [
      [whole, { width: 9, height: 8 }, /Cannot scale 8 × 8 to 9 × 8/],
      [whole.subarray(0, whole.length - 30), { width: 4, height: 4 }, /ends early/],
      [Buffer.from('not a png at all'), { width: 1, height: 1 }, /not a PNG/],
      [damaged, { width: 4, height: 4 }, /chunk is damaged/],
      [longHeader, { width: 1, height: 1 }, /broken header/],
      [headerless, { width: 2, height: 2 }, /before the header/],
      [afterHeader(whole, ihdr), { width: 2, height: 2 }, /a second header/],
      [
        afterHeader(whole, transparency(1, 1)),
        { width: 2, height: 2 },
        /transparency for colour type 2/,
      ],
      [
        afterHeader(whole, transparency(1, 1, 1), transparency(1, 1, 1)),
        { width: 2, height: 2 },
        /twice/,
      ],
      [lateTransparency, { width: 2, height: 2 }, /after the image data/],
      [
        afterHeader(whole, chunk('tRNS', new Uint8Array(4096))),
        { width: 2, height: 2 },
        /transparency chunk too long/,
      ],
      [unknownFilter, { width: 1, height: 1 }, /filter type 7/],
      [withHeader(8, 8, [8, 3, 0, 0, 0]), { width: 4, height: 4 }, /colour type 3/],
      [withHeader(8, 8, [16, 0, 0, 0, 0]), { width: 4, height: 4 }, /bit depth 16/],
      [withHeader(8, 8, [8, 0, 0, 0, 1]), { width: 4, height: 4 }, /interlaced/],
      [withHeader(8, 8, [8, 0, 1, 0, 0]), { width: 4, height: 4 }, /compression 1/],
      [withHeader(8, 8, [8, 0, 0, 1, 0]), { width: 4, height: 4 }, /filter method 1/],
      [withHeader(30_001, 1, [8, 0, 0, 0, 0]), { width: 1, height: 1 }, /30001 × 1 is too large/],
      [withHeader(13_000, 12_000, [8, 0, 0, 0, 0]), { width: 1, height: 1 }, /too large/],
    ];
    for (const [bytes, size, failure] of cases) {
      const result = scaler().scale(write('bad.png', bytes), size);
      await expect(result).rejects.toThrow(failure);
      await expect(result).rejects.toBeInstanceOf(PngWorkFailedError);
    }
    expect(made).toBe(cases.length);
    expect(existsSync(join(dir, 'out-1.png'))).toBe(false);
  });

  it('stops when asked to and removes the unfinished file', async () => {
    const source = write('big.png', pngOf(image(2000, 1500, 0, (x, y) => (x ^ y) & 0xff)));
    const controller = new AbortController();

    const result = scaler().scale(source, { width: 1000, height: 750 }, controller.signal);
    controller.abort();

    await expect(result).rejects.toBeInstanceOf(PngWorkStoppedError);
    expect(existsSync(join(dir, 'out-1.png'))).toBe(false);
    await expect(
      scaler().scale(source, { width: 1, height: 1 }, controller.signal),
    ).rejects.toBeInstanceOf(PngWorkStoppedError);
  });

  it('keeps the colour profile, and the pixel size scaled so the print size stays', async () => {
    const png = pngOf(image(40, 20, 2, (x) => x * 6));
    const phys = Buffer.alloc(9);
    phys.writeUInt32BE(11811, 0);
    phys.writeUInt32BE(11811, 4);
    phys.writeUInt8(1, 8);
    const kept = [
      chunk('iCCP', Buffer.from('Display P3\0\0profile')),
      chunk('gAMA', Buffer.from([0, 0, 0xb1, 0x8f])),
      chunk('pHYs', phys),
    ];
    const source = write(
      'profiled.png',
      Buffer.concat([png.subarray(0, 33), ...kept, png.subarray(33)]),
    );

    const scaled = await scaler().scale(source, { width: 10, height: 5 });

    const chunks = chunksOf(readFileSync(scaled.absolutePath));
    expect([...new Set(chunks.map(({ type }) => type))]).toEqual([
      'IHDR',
      'iCCP',
      'gAMA',
      'pHYs',
      'IDAT',
      'IEND',
    ]);
    expect(chunks[1]?.data.toString('latin1')).toBe('Display P3\0\0profile');
    const scaledPhys = chunks[3]?.data;
    expect([scaledPhys?.readUInt32BE(0), scaledPhys?.readUInt32BE(4), scaledPhys?.[8]]).toEqual([
      2953, 2953, 1,
    ]);
  });

  it('does not start a worker when stopped while its file is being made', async () => {
    const controller = new AbortController();
    let started = 0;
    const late = new WorkerPngScaler(
      () => {
        controller.abort();
        return newFile();
      },
      () => {
        started += 1;
        return inProcessWorker();
      },
    );

    await expect(
      late.scale(join(dir, 'any.png'), { width: 1, height: 1 }, controller.signal),
    ).rejects.toBeInstanceOf(PngWorkStoppedError);
    expect(started).toBe(0);
    expect(existsSync(join(dir, 'out-1.png'))).toBe(false);
  });

  it('fails when the worker stops without answering', async () => {
    const dying = Object.assign(new EventEmitter(), {
      postMessage: () => {
        setImmediate(() => dying.emit('exit', 134));
      },
      terminate: () => Promise.resolve(134),
    });
    const broken = new WorkerPngScaler(newFile, () => dying);

    await expect(broken.scale(join(dir, 'any.png'), { width: 1, height: 1 })).rejects.toThrow(
      new PngWorkFailedError('the worker stopped with code 134'),
    );
    expect(existsSync(join(dir, 'out-1.png'))).toBe(false);
  });

  it('fails when the worker does', async () => {
    const crashing = Object.assign(new EventEmitter(), {
      postMessage: () => {
        setImmediate(() => crashing.emit('error', new Error('worker crashed')));
      },
      terminate: () => Promise.resolve(1),
    });
    const broken = new WorkerPngScaler(newFile, () => crashing);

    await expect(broken.scale(join(dir, 'any.png'), { width: 1, height: 1 })).rejects.toThrow(
      'worker crashed',
    );
    expect(existsSync(join(dir, 'out-1.png'))).toBe(false);
  });
});

/** The 4 × 3 copy of the fixture as Pillow reads it, pixel after pixel in RGBA. */
const EXPECTED_SCALED = [
  38, 41, 230, 207, 109, 96, 197, 217, 166, 183, 173, 253, 226, 123, 144, 185, 60, 119, 201, 177,
  124, 168, 172, 231, 185, 128, 144, 241, 218, 123, 122, 207, 63, 175, 184, 226, 143, 164, 147, 221,
  198, 66, 123, 251, 96, 213, 93, 197,
];
