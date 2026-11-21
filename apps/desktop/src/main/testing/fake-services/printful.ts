import { bytes, PHOTO_PNG, route, type Answer, type FakeService } from './http.js';
import { failed, ok } from './printful-answers.js';
import { mockupTaskRoutes, type MockupSwitch } from './printful-mockups.js';
import { syncRoutes } from './printful-sync.js';

/** Where the fake's mockup photos are served from. */
const MOCKUP_CDN = 'https://mockups.printful-cdn.test';

const STORE = {
  id: 13000001,
  name: 'Fake Printful Store',
  type: 'etsy',
  website: 'https://www.etsy.com/shop/FakeShop',
};

const MUG_VARIANTS = [
  { id: 1320, name: 'White Glossy Mug 11 oz', size: '11 oz', printfile: 43 },
  { id: 4830, name: 'White Glossy Mug 15 oz', size: '15 oz', printfile: 44 },
  { id: 16586, name: 'White Glossy Mug 20 oz', size: '20 oz', printfile: 426 },
];

/** The products the app makes mugs on, by Printful product id. */
const CATALOG: Readonly<
  Record<string, { readonly details: unknown; readonly printfiles: unknown }>
> = {
  '19': {
    details: {
      product: { id: 19, type: 'MUG', title: 'White Glossy Mug', currency: 'USD' },
      variants: MUG_VARIANTS.map(({ id, name, size }) => ({
        id,
        product_id: 19,
        name,
        size,
        color: 'White',
        color_code: '#ffffff',
        price: '6.95',
        in_stock: true,
      })),
    },
    printfiles: {
      product_id: 19,
      available_placements: { default: 'Print file' },
      printfiles: [
        { printfile_id: 43, width: 2700, height: 1050, dpi: 300, fill_mode: 'fit' },
        { printfile_id: 44, width: 2700, height: 1140, dpi: 300, fill_mode: 'fit' },
        { printfile_id: 426, width: 3071, height: 1205, dpi: 300, fill_mode: 'fit' },
      ],
      variant_printfiles: MUG_VARIANTS.map(({ id, printfile }) => ({
        variant_id: id,
        placements: { default: printfile },
      })),
    },
  },
};

function fromCatalog(part: 'details' | 'printfiles'): Answer {
  return (_request, [productId = '']) => {
    const product = CATALOG[productId];
    return product ? ok(product[part]) : failed(404, 'Product not found');
  };
}

/**
 * Printful with one store synced to the Etsy shop: its catalog, mockup
 * generator, print files and the products it imported from the shop.
 */
export function fakePrintful(
  etsyProductIds: (listingId: string) => readonly string[] | undefined,
  hold: MockupSwitch,
) {
  const api: FakeService = {
    base: 'https://api.printful.com',
    signedIn: true,
    missing: () => failed(404, 'Not found'),
    routes: [
      route('GET', '/stores', () => ok([STORE])),
      route('GET', '/products/:id', fromCatalog('details')),
      route('GET', '/mockup-generator/printfiles/:id', fromCatalog('printfiles')),
      ...mockupTaskRoutes(MOCKUP_CDN, (productId) => productId in CATALOG, hold),
      ...syncRoutes(etsyProductIds),
    ],
  };
  const cdn: FakeService = {
    base: MOCKUP_CDN,
    routes: [route('GET', '/mockups/:file', () => bytes(PHOTO_PNG, 'image/png'))],
  };
  return [api, cdn];
}
