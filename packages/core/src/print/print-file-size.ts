import { checkPrint } from './print-check.js';
import { scaleFor, type FitMode, type Size } from './placement.js';
import type { PrintArea } from './print-product.js';

/**
 * The largest print file the app sends, in bytes: the smaller of Printful's
 * limit and Dropbox's. Printful's help centre gives 200 MB for its file
 * library and its support pages 100 MB for JPEG and PNG
 * (help.printful.com/hc/en-us/articles/360014066319,
 * support.printful.com/hc/en-us/articles/41396495537553), so the lower one
 * counts; Dropbox takes at most 150 MB in one upload
 * (dropbox.com/developers/documentation/http/documentation#files-upload).
 */
export const MAX_PRINT_FILE_BYTES = 100_000_000;

/**
 * The smallest size, in the image's own proportions and at most `image`, that
 * prints good on every area: the larger areas need no more pixels than this.
 */
export function printFileSize(image: Size, areas: readonly PrintArea[], fit: FitMode): Size {
  const needed = (area: PrintArea) => scaleFor(image, area, fit);
  const share = areas.length === 0 ? 1 : Math.min(1, Math.max(...areas.map(needed)));
  let width = Math.max(1, Math.ceil(image.width * share));
  const heightOf = (side: number) =>
    Math.min(image.height, Math.ceil((side * image.height) / image.width));
  // Rounding may leave a pixel short of a good rating, so the size grows until none is.
  while (
    width < image.width &&
    areas.some(
      (area) => checkPrint({ width, height: heightOf(width) }, area, fit).quality !== 'good',
    )
  ) {
    width += 1;
  }
  return { width, height: heightOf(width) };
}
