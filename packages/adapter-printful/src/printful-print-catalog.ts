import { apiPath } from '@pod/adapter-http';
import type {
  PrintArea,
  PrintCatalog,
  PrintProduct,
  PrintVariant,
  ProductFamilyId,
} from '@pod/core';
import { arrayAt, numberAt, objectAt, stringAt, type JsonObject } from './json.js';
import type { PrintfulClient } from './printful-client.js';

/** Printful catalog product each product family is made on; families not listed are not offered. */
const PRINTFUL_PRODUCTS: Readonly<Partial<Record<string, number>>> = {
  'phone-case': 601,
  'samsung-case': 686,
  mug: 19,
  blanket: 395,
  't-shirt': 71,
  sweatshirt: 145,
  hoodie: 146,
  poster: 1,
  canvas: 3,
  'tote-bag': 367,
  sticker: 358,
};

/**
 * Print areas a whole design can go on, the main one first. Sleeves, labels
 * and embroidery need artwork of their own, so they are left out.
 */
const DESIGN_PLACEMENTS = ['default', 'front', 'back'];

export class PrintfulPrintCatalog implements PrintCatalog {
  private readonly cache = new Map<ProductFamilyId, Promise<PrintProduct>>();

  constructor(
    private readonly client: Pick<PrintfulClient, 'get'>,
    private readonly products: Readonly<Partial<Record<string, number>>> = PRINTFUL_PRODUCTS,
  ) {}

  findProduct(familyId: ProductFamilyId): Promise<PrintProduct | undefined> {
    const productId = this.products[familyId];
    if (productId === undefined) return Promise.resolve(undefined);

    let product = this.cache.get(familyId);
    if (!product) {
      product = this.load(familyId, productId);
      this.cache.set(familyId, product);
      product.catch(() => this.cache.delete(familyId));
    }
    return product;
  }

  private async load(familyId: ProductFamilyId, productId: number): Promise<PrintProduct> {
    const [details, printfiles] = await Promise.all([
      this.client.get(apiPath`/products/${productId}`),
      this.client.get(apiPath`/mockup-generator/printfiles/${productId}`),
    ]);
    const info = objectAt(details, 'product details');
    return {
      familyId,
      productId: String(productId),
      name: stringAt(objectAt(info['product'], 'product')['title'], 'product title'),
      variants: variantsOf(info, objectAt(printfiles, 'printfiles')),
    };
  }
}

function variantsOf(details: JsonObject, printfiles: JsonObject): PrintVariant[] {
  const placements = placementsOf(printfiles);
  const sizes = printfileSizes(printfiles);
  const printfilesOfVariant = new Map(
    arrayAt(printfiles['variant_printfiles'], 'variant printfiles').map((entry) => {
      const mapping = objectAt(entry, 'variant printfile');
      const ids = objectAt(mapping['placements'], 'variant placements');
      return [numberAt(mapping['variant_id'], 'variant id'), ids] as const;
    }),
  );

  return arrayAt(details['variants'], 'variants').flatMap((entry) => {
    const variant = objectAt(entry, 'variant');
    if (variant['in_stock'] === false) return [];
    const id = numberAt(variant['id'], 'variant id');
    const ids = printfilesOfVariant.get(id) ?? {};
    const areas = placements.flatMap((placement): PrintArea[] => {
      const size = sizes.get(ids[placement]);
      return size ? [{ placement, ...size }] : [];
    });
    if (areas.length === 0) return [];
    return [
      {
        id: String(id),
        name: stringAt(variant['name'], 'variant name'),
        color: optionalText(variant['color']),
        size: optionalText(variant['size']),
        areas,
      },
    ];
  });
}

function printfileSizes(printfiles: JsonObject) {
  return new Map<unknown, Omit<PrintArea, 'placement'>>(
    arrayAt(printfiles['printfiles'], 'printfiles').map((entry) => {
      const file = objectAt(entry, 'printfile');
      const size = {
        width: numberAt(file['width'], 'printfile width'),
        height: numberAt(file['height'], 'printfile height'),
        dpi: numberAt(file['dpi'], 'printfile dpi'),
      };
      return [numberAt(file['printfile_id'], 'printfile id'), size];
    }),
  );
}

function placementsOf(printfiles: JsonObject): string[] {
  const available = Object.keys(objectAt(printfiles['available_placements'], 'placements'));
  const forDesigns = DESIGN_PLACEMENTS.filter((placement) => available.includes(placement));
  return forDesigns.length > 0 ? forDesigns : [stringAt(available[0], 'first placement')];
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
