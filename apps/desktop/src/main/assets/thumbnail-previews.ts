import { readFile } from 'node:fs/promises';
import { PREVIEW_SIDE, type ImageAsset, type ImagePreviews, type PreviewImage } from '@pod/core';
import type { ThumbnailCache } from './thumbnail-cache.js';

export interface Bitmap {
  /** BGRA with premultiplied alpha, as Chromium decodes images. */
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface BitmapCodec {
  decodePng(png: Uint8Array): Bitmap;
  encodeJpeg(bitmap: Bitmap, quality: number): Uint8Array;
}

/** A mid grey, so both white and black print on a transparent ground stay readable. */
const BACKGROUND = 140;
const QUALITIES = [85, 70, 55];
/** Well under the API's limit for one image, so a busy print still goes through. */
export const MAX_PREVIEW_BYTES = 1_500_000;

/** The pixels laid on the background, fully opaque. */
export function flatten({ pixels, width, height }: Bitmap): Bitmap {
  const flat = new Uint8Array(pixels.length);
  for (let at = 0; at < pixels.length; at += 4) {
    const behind = (BACKGROUND * (255 - (pixels[at + 3] ?? 0))) / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      flat[at + channel] = Math.min(255, Math.round((pixels[at + channel] ?? 0) + behind));
    }
    flat[at + 3] = 255;
  }
  return { pixels: flat, width, height };
}

/**
 * JPEG previews made from the thumbnail cache, so an image is scaled once
 * however often it is sent. JPEG has no transparency, so the print is laid
 * on a mid grey first.
 */
export class ThumbnailPreviews implements ImagePreviews {
  constructor(
    private readonly thumbnails: Pick<ThumbnailCache, 'get'>,
    private readonly pathOf: (storageKey: string) => string,
    private readonly codec: BitmapCodec,
  ) {}

  async preview(asset: ImageAsset, side = PREVIEW_SIDE): Promise<PreviewImage> {
    const scale = Math.min(1, side / Math.max(asset.width, asset.height));
    const width = Math.max(1, Math.round(asset.width * scale));
    const path = await this.thumbnails.get(asset.storageKey, this.pathOf(asset.storageKey), width);
    const flat = flatten(this.codec.decodePng(await readFile(path)));
    for (const quality of QUALITIES) {
      const data = this.codec.encodeJpeg(flat, quality);
      if (data.length <= MAX_PREVIEW_BYTES) return { data, mimeType: 'image/jpeg' };
    }
    throw new Error(`The preview of ${asset.storageKey} is larger than ${MAX_PREVIEW_BYTES} bytes`);
  }
}
