import type { LocalImage, TemporaryFile } from './downloads.js';
import type { StopSignal } from './work.js';

/** An image laid onto a plain background, written for a moment. */
export interface FlattenedImage extends TemporaryFile, LocalImage {}

/**
 * Lays images that may be see-through onto an opaque background, for places
 * that show transparency badly: Etsy shows a transparent background as black.
 */
export interface ImageFlattener {
  /**
   * The image with every pixel opaque, on white; `undefined` when it has no
   * transparency to begin with, so it can be used as it is. `signal` stops the work.
   */
  flatten(image: LocalImage, signal?: StopSignal): Promise<FlattenedImage | undefined>;
}
