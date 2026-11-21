import type { DefaultFamilyId } from '@pod/rules';
import type { ProductFacts } from './product-facts.js';

const PRINTED_APPAREL_CARE =
  'Machine wash cold, inside out. Tumble dry low. Do not iron over the print. Do not dry clean.';
const BLEND = '50% cotton, 50% polyester; some grey and heather colours are other blends';
const none: ProductFacts = { material: '', care: '', fit: '', size: '' };

/**
 * Facts that hold for every variant of the product each default family is
 * made on, as a starting point the seller checks and completes. A fact that
 * varies by variant or that is unconfirmed is left empty rather than guessed.
 */
export const DEFAULT_PRODUCT_FACTS: Readonly<Record<DefaultFamilyId, ProductFacts>> = {
  'phone-case': none,
  'samsung-case': none,
  mug: {
    ...none,
    material: 'White ceramic with a glossy finish',
    care: 'Dishwasher and microwave safe',
  },
  blanket: none,
  't-shirt': {
    material:
      'Most solid colours are 100% combed and ring-spun cotton; Ash and the heather colours are cotton-polyester blends',
    care: PRINTED_APPAREL_CARE,
    fit: 'Unisex fit',
    size: '',
  },
  sweatshirt: {
    material: BLEND,
    care: PRINTED_APPAREL_CARE,
    fit: 'Unisex fit',
    size: '',
  },
  hoodie: {
    material: BLEND,
    care: PRINTED_APPAREL_CARE,
    fit: 'Unisex fit',
    size: '',
  },
  poster: { ...none, material: 'Matte paper; frame not included' },
  canvas: { ...none, material: 'Canvas stretched over wooden stretcher bars' },
  'tote-bag': none,
  sticker: { ...none, material: 'Kiss-cut vinyl' },
};

/**
 * The sizes, as the print provider names them, that listings of a family sell
 * until the seller chooses others; families not listed sell every size. One
 * blanket size keeps the price simple; the seller can add the larger one.
 */
export const DEFAULT_LISTING_SIZES: Readonly<Partial<Record<DefaultFamilyId, readonly string[]>>> =
  {
    blanket: ['50″×60″'],
  };
