import type { Size } from './placement.js';

export type Orientation = 'portrait' | 'landscape' | 'square';

export function orientationOf({ width, height }: Size): Orientation {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

/** Whether one is taller than wide and the other wider than tall. */
export function crossesOrientation(image: Size, area: Size): boolean {
  const [a, b] = [orientationOf(image), orientationOf(area)];
  return a !== 'square' && b !== 'square' && a !== b;
}
