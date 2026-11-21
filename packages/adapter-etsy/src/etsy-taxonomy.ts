import type { DefaultFamilyId } from '@pod/rules';

/**
 * Etsy category each product family is listed in, from GET /seller-taxonomy/nodes.
 * Posters and canvases share Art & Collectibles > Prints, iPhone and Samsung cases Phone Cases.
 */
export const ETSY_TAXONOMY: Readonly<Partial<Record<DefaultFamilyId, number>>> = {
  'phone-case': 873,
  'samsung-case': 873,
  mug: 1062,
  blanket: 915,
  't-shirt': 482,
  sweatshirt: 2202,
  hoodie: 1853,
  poster: 119,
  canvas: 119,
  'tote-bag': 190,
  sticker: 1326,
};
