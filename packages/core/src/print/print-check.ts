import type { PrintArea } from './print-product.js';
import { placeImage, type FitMode, type Placement, type Size } from './placement.js';

/** Below this print providers warn that the print may look blurry. */
export const MIN_DPI = 150;

export type PrintQuality = 'good' | 'acceptable' | 'poor';

export interface PrintCheck {
  readonly fit: FitMode;
  readonly placement: Placement;
  /** Image pixels per printed inch once placed, rounded down. */
  readonly effectiveDpi: number;
  readonly quality: PrintQuality;
  /** Share of the print area the image covers, 0 to 1. */
  readonly areaCovered: number;
  /** Share of the image cut off at the edges of the area, 0 to 1. */
  readonly imageCropped: number;
}

export function checkPrint(image: Size, area: PrintArea, fit: FitMode): PrintCheck {
  const placement = placeImage(image, area, fit);
  const effectiveDpi = Math.floor((area.dpi * image.width) / placement.width);
  const visibleWidth = Math.min(placement.width, area.width);
  const visibleHeight = Math.min(placement.height, area.height);
  const visible = visibleWidth * visibleHeight;

  return {
    fit,
    placement,
    effectiveDpi,
    // The print area's own resolution is what the provider prints at, so an image
    // made exactly to its size is as sharp as the product allows.
    quality: effectiveDpi >= area.dpi ? 'good' : effectiveDpi >= MIN_DPI ? 'acceptable' : 'poor',
    areaCovered: round(visible / (area.width * area.height)),
    imageCropped: round(1 - visible / (placement.width * placement.height)),
  };
}

function round(share: number): number {
  return Math.round(share * 1000) / 1000;
}
