import type { ImageAsset } from '../catalog/model.js';

/** A small copy of an image, for a reader that only needs to see it. */
export interface PreviewImage {
  readonly data: Uint8Array;
  readonly mimeType: 'image/png' | 'image/jpeg';
}

export interface ImagePreviews {
  /** The stored image scaled down to about `side` pixels on its longest side. */
  preview(asset: ImageAsset, side?: number): Promise<PreviewImage>;
}

/** Longest side of a preview by default: enough to read the words in a print, small enough to send. */
export const PREVIEW_SIDE = 1024;
