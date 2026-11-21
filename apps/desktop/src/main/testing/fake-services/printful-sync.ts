import { counter, jsonOf, route, type Answer, type Json, type Route } from './http.js';
import { failed, ok } from './printful-answers.js';

/** Print files Printful fetched from a shared address, by id. */
function printFileRoutes(files: Map<string, Json>): Route[] {
  const fileId = counter(600000001);
  const addFile: Answer = async (request) => {
    const body = await jsonOf(request);
    if (typeof body['url'] !== 'string') return failed(400, 'Missing url');
    const id = fileId();
    const file = {
      id,
      type: 'default',
      url: body['url'],
      filename: body['filename'],
      status: 'ok',
    };
    files.set(String(id), file);
    return ok(file);
  };
  return [
    route('POST', '/files', addFile),
    route('GET', '/files/:id', (_request, [id = '']) => {
      const file = files.get(id);
      return file ? ok(file) : failed(404, 'File not found');
    }),
  ];
}

/** The sync variants of the products Printful imported, one per Etsy product, made once each. */
class SyncedProducts {
  readonly variants = new Map<string, Json>();
  private readonly variantOfProduct = new Map<string, number>();
  private readonly productOfListing = new Map<string, number>();
  private readonly variantId = counter(500000001);
  private readonly productId = counter(400000001);

  constructor(
    private readonly etsyProductIds: (listingId: string) => readonly string[] | undefined,
  ) {}

  readonly read: Answer = (_request, [listingId = '']) => {
    const productIds = this.etsyProductIds(listingId);
    if (!productIds) return failed(404, 'Product not found');
    const id = this.productOfListing.get(listingId) ?? this.productId();
    this.productOfListing.set(listingId, id);
    const variants = productIds.map((productId) => this.variantFor(productId, id));
    return ok({
      sync_product: { id, external_id: listingId, variants: variants.length },
      sync_variants: variants,
    });
  };

  private variantFor(productId: string, syncProductId: number): Json {
    const known = this.variantOfProduct.get(productId);
    if (known !== undefined) return this.variants.get(String(known)) as Json;
    const variant = {
      id: this.variantId(),
      external_id: productId,
      sync_product_id: syncProductId,
      synced: false,
    };
    this.variantOfProduct.set(productId, variant.id);
    this.variants.set(String(variant.id), variant);
    return variant;
  }
}

/**
 * Print files and the products Printful imported from the Etsy shop, whose
 * variants a listing's variations become.
 */
export function syncRoutes(
  etsyProductIds: (listingId: string) => readonly string[] | undefined,
): Route[] {
  const files = new Map<string, Json>();
  const synced = new SyncedProducts(etsyProductIds);
  const linkVariant: Answer = async (request, [id = '']) => {
    const variant = synced.variants.get(id);
    if (!variant) return failed(404, 'Sync variant not found');
    const body = await jsonOf(request);
    const fileIds = (body['files'] as Json[]).map((file) => String(file['id']));
    if (fileIds.some((fileId) => !files.has(fileId))) return failed(404, 'File not found');
    Object.assign(variant, { variant_id: body['variant_id'], files: body['files'], synced: true });
    return ok(variant);
  };
  return [
    ...printFileRoutes(files),
    route('GET', '/sync/products/@:listing', synced.read),
    route('PUT', '/sync/variant/:id', linkVariant),
  ];
}
