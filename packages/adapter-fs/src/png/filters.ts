import { UnsupportedPngError } from '../errors.js';

/** The predictor of PNG filter type 4, from the bytes left, above and above-left. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** What filter `type` predicts for byte `i`, from bytes already known. */
function predict(
  type: number,
  line: Uint8Array,
  previous: Uint8Array,
  i: number,
  bpp: number,
): number {
  const left = i >= bpp ? (line[i - bpp] ?? 0) : 0;
  const up = previous[i] ?? 0;
  switch (type) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, i >= bpp ? (previous[i - bpp] ?? 0) : 0);
    default:
      throw new UnsupportedPngError(`filter type ${String(type)}`);
  }
}

/**
 * Restores one scanline in place. `previous` is the restored line above, all
 * zeros for the first; `bpp` is the bytes per pixel.
 */
export function unfilter(type: number, line: Uint8Array, previous: Uint8Array, bpp: number): void {
  // Sub and Up, the most common filters, skip the general predictor: images have millions of lines.
  if (type === 0) return;
  if (type > 4) throw new UnsupportedPngError(`filter type ${String(type)}`);
  if (type === 1) {
    for (let i = bpp; i < line.length; i += 1)
      line[i] = ((line[i] ?? 0) + (line[i - bpp] ?? 0)) & 0xff;
    return;
  }
  if (type === 2) {
    for (let i = 0; i < line.length; i += 1) line[i] = ((line[i] ?? 0) + (previous[i] ?? 0)) & 0xff;
    return;
  }
  for (let i = 0; i < line.length; i += 1) {
    line[i] = ((line[i] ?? 0) + predict(type, line, previous, i, bpp)) & 0xff;
  }
}

/** One scanline with the filter in front of it, as the PNG stores it. */
export function filtered(
  type: number,
  line: Uint8Array,
  previous: Uint8Array,
  bpp: number,
): Uint8Array {
  const out = new Uint8Array(line.length + 1);
  out[0] = type;
  for (let i = 0; i < line.length; i += 1) {
    out[i + 1] = ((line[i] ?? 0) - predict(type, line, previous, i, bpp)) & 0xff;
  }
  return out;
}

/** The sum of the bytes read as signed, which libpng uses to guess the filter that compresses best. */
function cost(line: Uint8Array): number {
  let sum = 0;
  for (let i = 1; i < line.length; i += 1) {
    const byte = line[i] ?? 0;
    sum += byte < 128 ? byte : 256 - byte;
  }
  return sum;
}

/** The scanline under whichever of the five filters likely compresses it best. */
export function bestFiltered(line: Uint8Array, previous: Uint8Array, bpp: number): Uint8Array {
  let best = filtered(0, line, previous, bpp);
  let bestCost = cost(best);
  for (let type = 1; type <= 4; type += 1) {
    const candidate = filtered(type, line, previous, bpp);
    const candidateCost = cost(candidate);
    if (candidateCost < bestCost) {
      best = candidate;
      bestCost = candidateCost;
    }
  }
  return best;
}
