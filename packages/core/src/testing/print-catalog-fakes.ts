import { productFamilyId, type ProductFamilyId } from '../catalog/product-family.js';
import type {
  GeneratedMockup,
  MockupGenerator,
  MockupRequest,
  PrintCatalog,
} from '../ports/print-provider.js';
import type { PrintProduct } from '../print/print-product.js';

/** A shirt shaped like Printful's Bella + Canvas 3001: two colours, two sizes, front and back. */
export const SAMPLE_SHIRT: PrintProduct = {
  familyId: productFamilyId('t-shirt'),
  productId: '71',
  name: 'Unisex Staple T-Shirt',
  variants: ['Black', 'White'].flatMap((color, colorIndex) =>
    ['M', 'L'].map((size, sizeIndex) => ({
      id: String(4000 + colorIndex * 10 + sizeIndex),
      name: `Unisex Staple T-Shirt (${color} / ${size})`,
      color,
      size,
      areas: [
        { placement: 'front', width: 1800, height: 2400, dpi: 150 },
        { placement: 'back', width: 1800, height: 2400, dpi: 150 },
      ],
    })),
  ),
};

/** A mug shaped like Printful's White Glossy Mug: three sizes, one wrap-around area. */
export const SAMPLE_MUG: PrintProduct = {
  familyId: productFamilyId('mug'),
  productId: '19',
  name: 'White Glossy Mug',
  variants: [
    {
      id: '1320',
      name: 'White Glossy Mug 11 oz',
      color: 'White',
      size: '11 oz',
      areas: [{ placement: 'default', width: 2700, height: 1050, dpi: 300 }],
    },
    {
      id: '4830',
      name: 'White Glossy Mug 15 oz',
      color: 'White',
      size: '15 oz',
      areas: [{ placement: 'default', width: 2700, height: 1140, dpi: 300 }],
    },
  ],
};

export class FakePrintCatalog implements PrintCatalog {
  private readonly products = new Map<ProductFamilyId, PrintProduct>();

  constructor(products: readonly PrintProduct[] = [SAMPLE_MUG]) {
    for (const product of products) this.products.set(product.familyId, product);
  }

  findProduct(familyId: ProductFamilyId): Promise<PrintProduct | undefined> {
    return Promise.resolve(this.products.get(familyId));
  }
}

/** Answers every request with a front and a side photo of the requested variants. */
export class FakeMockupGenerator implements MockupGenerator {
  readonly requests: MockupRequest[] = [];
  failWith: Error | undefined;

  generate(request: MockupRequest): Promise<readonly GeneratedMockup[]> {
    this.requests.push(request);
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(
      ['Front', 'Left'].map((view) => ({
        url: `https://provider.test/${request.variantIds.join('-')}/${view}.png`,
        view,
      })),
    );
  }
}
