import type { LocalImage, TemporaryFile } from './downloads.js';
import type { StopSignal } from './work.js';

/** What artwork is treated as: drawn and flat, or photographic. */
export type UpscaleModel = 'illustration' | 'photo';

export interface UpscaleRequest {
  readonly image: LocalImage;
  readonly model: UpscaleModel;
  /** Share done, from 0 to 1. */
  readonly onProgress?: ((share: number) => void) | undefined;
  readonly signal?: StopSignal | undefined;
}

/** Makes an image larger by a fixed factor, inventing detail rather than blurring it. */
export interface Upscaler {
  /** How many times wider and taller the result is. */
  readonly scale: number;
  /** Writes the larger image, a PNG, to a temporary file the caller disposes of. */
  upscale(request: UpscaleRequest): Promise<TemporaryFile>;
}
