import type { Placement, PrintArea } from '@pod/core';
import type { JsonObject } from './json.js';

/** Where the design sits on the print area, as Printful's file `position`. */
export function printfulPosition(area: PrintArea, placement: Placement): JsonObject {
  return {
    area_width: area.width,
    area_height: area.height,
    width: placement.width,
    height: placement.height,
    top: placement.top,
    left: placement.left,
  };
}
