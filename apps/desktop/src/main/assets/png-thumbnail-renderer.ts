import { readFile } from 'node:fs/promises';
import type { ImageInspector, ImageScaler } from '@pod/core';
import { SerialQueue } from '../shared/serial-queue.js';
import type { ThumbnailRenderer } from './thumbnail-cache.js';

/** Above this many pixels a PNG is too large to decode at once on the main thread. */
export const LARGE_PNG_PIXELS = 40_000_000;

export interface PngThumbnailDeps {
  readonly inspector: ImageInspector;
  /** Scales PNGs off the main thread. */
  readonly scaler: ImageScaler;
  /** Renders every other image, and large PNGs the scaler fails on. */
  readonly other: ThumbnailRenderer;
  /** Hears why the scaler failed before the other renderer took over. */
  readonly onFallback: (error: unknown) => void;
}

/**
 * Renders thumbnails of large PNGs, such as upscaled artwork of over a hundred
 * million pixels, with the scaler, one at a time so a page of them never runs
 * a worker each; smaller images are quicker the usual way.
 */
export function pngThumbnailRenderer(deps: PngThumbnailDeps): ThumbnailRenderer {
  const queue = new SerialQueue();
  return {
    render: async (sourcePath, width) => {
      const info = await deps.inspector.inspect(sourcePath);
      const large = info?.mimeType === 'image/png' && info.width * info.height > LARGE_PNG_PIXELS;
      if (!info || !large) return deps.other.render(sourcePath, width);
      const scaledWidth = Math.min(width, info.width);
      const size = {
        width: scaledWidth,
        height: Math.max(1, Math.round((info.height * scaledWidth) / info.width)),
      };
      try {
        const file = await queue.run(() => deps.scaler.scale(sourcePath, size));
        try {
          return await readFile(file.absolutePath);
        } finally {
          await file.dispose();
        }
      } catch (error) {
        deps.onFallback(error);
        return deps.other.render(sourcePath, width);
      }
    },
  };
}
