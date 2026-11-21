import type { LookChoices } from '../mockups/scenes/scene-look.js';
import type { PreviewImage } from './previews.js';

export interface StyleReading {
  /** The reference's style as a scene for our product; `null` when it shows nothing usable. */
  readonly description: string | null;
  /** Every word the reader could read in the reference, so none of them is passed on. */
  readonly visibleWords: readonly string[];
  /** The look options the reference clearly shows; the others are left at Auto. */
  readonly look: LookChoices;
}

/** Describes the photographic style of someone else's product photo, never its design. */
export interface SceneStyleReader {
  /**
   * `productType` is our product, e.g. `mug`, which may differ from the one in
   * the reference. `avoid` names words an earlier description wrongly used.
   */
  read(
    reference: PreviewImage,
    productType: string,
    avoid: readonly string[],
  ): Promise<StyleReading>;
}
