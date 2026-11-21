import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageAsset } from '@pod/core';
import { ThumbnailCache } from './thumbnail-cache.js';
import {
  flatten,
  MAX_PREVIEW_BYTES,
  ThumbnailPreviews,
  type Bitmap,
  type BitmapCodec,
} from './thumbnail-previews.js';

const asset = (width: number, height: number): ImageAsset => ({
  sha256: 'ab',
  storageKey: 'ab/cd.png',
  mimeType: 'image/png',
  width,
  height,
  byteSize: 10,
});

describe('flatten', () => {
  it('lays premultiplied pixels on a mid grey and makes them opaque', () => {
    const bitmap: Bitmap = {
      // Transparent, half-transparent red, opaque black.
      pixels: new Uint8Array([0, 0, 0, 0, 0, 0, 128, 128, 0, 0, 0, 255]),
      width: 3,
      height: 1,
    };

    expect([...flatten(bitmap).pixels]).toEqual([
      140, 140, 140, 255, 70, 70, 198, 255, 0, 0, 0, 255,
    ]);
  });
});

describe('ThumbnailPreviews', () => {
  let dir: string;
  let widths: number[];
  let qualities: number[];
  let sizes: number[];
  let previews: ThumbnailPreviews;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pod-previews-'));
    widths = [];
    qualities = [];
    sizes = [10, 10, 10];
    const cache = new ThumbnailCache(dir, {
      render: (_path, width) => {
        widths.push(width);
        return Promise.resolve(new Uint8Array([1]));
      },
    });
    const codec: BitmapCodec = {
      decodePng: () => ({ pixels: new Uint8Array([0, 0, 0, 0]), width: 1, height: 1 }),
      encodeJpeg: (bitmap, quality) => {
        qualities.push(quality);
        expect(bitmap.pixels[3]).toBe(255);
        return new Uint8Array(sizes[qualities.length - 1] ?? 0);
      },
    };
    previews = new ThumbnailPreviews(cache, (key) => `/assets/${key}`, codec);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scales the longest side to the preview size, never up, and sends JPEG', async () => {
    const tall = await previews.preview(asset(4500, 5400));
    await previews.preview(asset(600, 300));

    expect(widths).toEqual([853, 600]);
    expect(tall.mimeType).toBe('image/jpeg');
    expect(tall.data).toHaveLength(10);
  });

  it('lowers the quality until the preview is small enough, then gives up', async () => {
    sizes = [MAX_PREVIEW_BYTES + 1, MAX_PREVIEW_BYTES];
    expect((await previews.preview(asset(100, 100))).data).toHaveLength(MAX_PREVIEW_BYTES);
    expect(qualities).toEqual([85, 70]);

    qualities = [];
    sizes = [MAX_PREVIEW_BYTES + 1, MAX_PREVIEW_BYTES + 1, MAX_PREVIEW_BYTES + 1];
    await expect(previews.preview(asset(100, 100))).rejects.toThrow(/larger than/);
  });
});
