import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageInfo, ImageScaler } from '@pod/core';
import { LARGE_PNG_PIXELS, pngThumbnailRenderer } from './png-thumbnail-renderer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-thumbs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Reports every image with the size given, so small files stand in for huge ones. */
const inspector = (info: ImageInfo | undefined) => ({ inspect: () => Promise.resolve(info) });
const huge: ImageInfo = { mimeType: 'image/png', width: 8000, height: 6000 };

function renderer(info: ImageInfo | undefined, scaler?: ImageScaler) {
  const other = { render: vi.fn(() => Promise.resolve(Uint8Array.from([1, 2, 3]))) };
  const onFallback = vi.fn();
  const render = pngThumbnailRenderer({
    inspector: inspector(info),
    scaler: scaler ?? fileScaler(),
    other,
    onFallback,
  });
  return { render, other, onFallback };
}

/** Writes each scaled copy as its width and height in text, to see what was asked for. */
function fileScaler(scaled: string[] = []): ImageScaler {
  return {
    scale: (_source, size) => {
      const absolutePath = join(dir, `scaled-${String(scaled.length)}`);
      writeFileSync(absolutePath, `${String(size.width)}x${String(size.height)}`);
      scaled.push(absolutePath);
      return Promise.resolve({
        ...size,
        absolutePath,
        byteSize: 1,
        dispose: () => {
          rmSync(absolutePath);
          return Promise.resolve();
        },
      });
    },
  };
}

const textOf = (bytes: Uint8Array) => Buffer.from(bytes).toString();

function write(name: string, bytes: Buffer | string): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

describe('pngThumbnailRenderer', () => {
  it('scales a large PNG with the scaler, in its proportions, leaving no file behind', async () => {
    const scaled: string[] = [];
    const { render, other } = renderer(huge, fileScaler(scaled));
    expect(huge.width * huge.height).toBeGreaterThan(LARGE_PNG_PIXELS);

    const thumbnail = await render.render(write('art.png', 'png'), 100);

    expect(textOf(thumbnail)).toBe('100x75');
    expect(other.render).not.toHaveBeenCalled();
    expect(scaled.filter((path) => existsSync(path))).toEqual([]);
  });

  it('leaves smaller PNGs, other images and unreadable files to the usual renderer', async () => {
    const source = write('art.png', 'png');
    const cases: (ImageInfo | undefined)[] = [
      { mimeType: 'image/png', width: 6000, height: 6000 },
      { mimeType: 'image/jpeg', width: 8000, height: 6000 },
      undefined,
    ];
    for (const info of cases) {
      const { render, other } = renderer(info);

      expect(await render.render(source, 100)).toEqual(Uint8Array.from([1, 2, 3]));
      expect(other.render).toHaveBeenCalledWith(source, 100);
    }
  });

  it('scales one large PNG at a time', async () => {
    let running = 0;
    let most = 0;
    const scaler: ImageScaler = {
      scale: async (source, size) => {
        running += 1;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        const absolutePath = join(dir, `scaled-${String(size.width)}`);
        writeFileSync(absolutePath, String(size.width));
        return { ...size, absolutePath, byteSize: 1, dispose: () => Promise.resolve() };
      },
    };
    const { render } = renderer(huge, scaler);
    const source = write('art.png', 'png');

    const thumbnails = await Promise.all([10, 20, 30].map((width) => render.render(source, width)));

    expect(thumbnails.map(textOf)).toEqual(['10', '20', '30']);
    expect(most).toBe(1);
  });

  it('falls back to the usual renderer when the scaler fails for any reason', async () => {
    const failure = new Error('ENOSPC');
    const { render, other, onFallback } = renderer(huge, {
      scale: () => Promise.reject(failure),
    });
    const source = write('art.png', 'png');

    expect(await render.render(source, 4)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(onFallback).toHaveBeenCalledWith(failure);
    expect(other.render).toHaveBeenCalledWith(source, 4);
  });
});
