import type { DefaultFamilyId } from '@pod/rules';
import { productFamilyId, type ProductFamily } from './product-family.js';

const family = (
  id: DefaultFamilyId,
  fileAliases: readonly string[],
  artworkOf?: DefaultFamilyId,
): ProductFamily => ({
  id: productFamilyId(id),
  fileAliases,
  ...(artworkOf === undefined ? {} : { artworkOf: productFamilyId(artworkOf) }),
});

/** The print-on-demand products the app knows, with their file names in English, Turkish and German. */
export const DEFAULT_PRODUCT_FAMILIES: readonly ProductFamily[] = [
  family('phone-case', [
    'phone case',
    'phonecase',
    'iphone case',
    'telefon kilifi',
    'iphone kilifi',
    'kilif',
    'handyhulle',
    'iphone hulle',
  ]),
  family(
    'samsung-case',
    ['samsung case', 'samsung kilifi', 'samsung kilif', 'samsung hulle', 'samsung handyhulle'],
    'phone-case',
  ),
  family('mug', ['mug', 'kupa', 'tasse', 'becher']),
  family('blanket', ['blanket', 'throw blanket', 'battaniye', 'decke', 'kuscheldecke']),
  family('t-shirt', ['t shirt', 'tshirt', 'tee', 'tisort']),
  family('sweatshirt', ['sweatshirt', 'sweat', 'pullover']),
  family('hoodie', ['hoodie', 'hoody', 'kapusonlu', 'kapusonlu sweatshirt', 'kapuzenpullover']),
  family('poster', ['poster', 'afis', 'plakat']),
  family('canvas', [
    'canvas',
    'canvas print',
    'kanvas',
    'kanvas tablo',
    'leinwand',
    'leinwandbild',
  ]),
  family('tote-bag', ['tote bag', 'tote', 'bez canta', 'stofftasche', 'jutebeutel']),
  family('sticker', ['sticker', 'cikartma', 'aufkleber']),
];
