import type { Orientation } from '../print/orientation.js';
import type { PreviewImage } from './previews.js';

/** The turn that keeps artwork upright on a product held the artwork's way, or `0` to leave it. */
export interface RotationAdvice {
  readonly degrees: 0 | 90 | 270;
  /** One short sentence for the seller. */
  readonly reason: string;
}

/** What the artwork is going on, for the reader to judge. */
export interface RotationQuestion {
  readonly artwork: PreviewImage;
  readonly artworkOrientation: Orientation;
  readonly areaOrientation: Orientation;
  /** The product family, e.g. `blanket`. */
  readonly product: string;
}

/** Judges which way artwork can be turned to fill a print area of the other orientation. */
export interface RotationAdvisor {
  advise(question: RotationQuestion): Promise<RotationAdvice>;
}
