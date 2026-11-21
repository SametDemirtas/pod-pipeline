import { ConflictError } from '../errors.js';
import type { DesignId } from '../catalog/model.js';
import type { Listing, ListingId, ListingState } from '../listing/listing.js';
import type { ListingText } from '../listing/listing-text.js';
import type { ProductFacts } from '../catalog/product-facts.js';
import type { CopyBrief, ListingCopywriter, ProductFactsSource } from '../ports/copywriter.js';
import type { LocalImage } from '../ports/downloads.js';
import type { ListingRepository } from '../ports/listings.js';
import type { ImagePreviews, PreviewImage } from '../ports/previews.js';
import type {
  CreatedProduct,
  ListingPhoto,
  ListingProduct,
  MarketplaceLinks,
  MarketplaceListings,
  MarketplaceShop,
  NewListing,
  ShopOptions,
} from '../ports/marketplace.js';
import type { PrintPreview, PrintSync, SyncedVariant, VariantLink } from '../ports/print-sync.js';

export const SAMPLE_LINKS: MarketplaceLinks = {
  listingUrl: (id) => `https://shop.example/listing/${id}`,
  editUrl: (id) => `https://shop.example/edit/${id}`,
  draftsUrl: () => 'https://shop.example/drafts',
};

const SAMPLE_SHOP: ShopOptions = {
  shopName: 'ExampleShop',
  currency: 'USD',
  currencyDigits: 2,
  shippingProfiles: [{ id: '316', label: 'Printful: Mugs' }],
  readinessStates: [{ id: '151', label: 'Made to order, 2-6 days' }],
  returnPolicies: [{ id: '1518', label: 'Returns within 14 days' }],
  productionPartners: [{ id: '77', label: 'Printful' }],
  languages: ['en-US', 'de', 'fr'],
};

export class FakeShop implements MarketplaceShop {
  constructor(private readonly shop: ShopOptions = SAMPLE_SHOP) {}

  options(): Promise<ShopOptions> {
    return Promise.resolve(this.shop);
  }
}

/** Remembers every listing it was asked to make; product ids are `p-` and the SKU. */
export class FakeMarketplace implements MarketplaceListings {
  readonly drafts = new Map<string, NewListing>();
  readonly products = new Map<string, readonly ListingProduct[]>();
  readonly images = new Map<string, readonly LocalImage[]>();
  readonly translations = new Map<string, ListingText>();
  readonly removed: string[] = [];
  readonly published: string[] = [];
  failOn: 'setProducts' | 'addImages' | 'replaceImages' | 'publish' | undefined;
  private next = 9000;

  createDraft(listing: NewListing): Promise<string> {
    const id = String(this.next++);
    this.drafts.set(id, listing);
    return Promise.resolve(id);
  }

  setProducts(listingId: string, products: readonly ListingProduct[]) {
    if (this.failOn === 'setProducts') return Promise.reject(new Error('Etsy is down'));
    this.products.set(listingId, products);
    return Promise.resolve(
      products.map((product): CreatedProduct => ({
        sku: product.sku,
        productId: `p-${product.sku}`,
      })),
    );
  }

  setTranslation(listingId: string, language: string, text: ListingText): Promise<void> {
    this.translations.set(`${listingId}/${language}`, text);
    return Promise.resolve();
  }

  addImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    if (this.failOn === 'addImages') return Promise.reject(new Error('image too large'));
    this.images.set(listingId, images);
    return Promise.resolve();
  }

  replaceImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    if (this.failOn === 'replaceImages') return Promise.reject(new Error('image too large'));
    this.images.set(listingId, images);
    return Promise.resolve();
  }

  remove(listingId: string): Promise<void> {
    this.removed.push(listingId);
    this.drafts.delete(listingId);
    return Promise.resolve();
  }

  /** The photos the marketplace shows; a listing with none set shows none. */
  readonly shownPhotos = new Map<string, readonly ListingPhoto[]>();

  photos(listingId: string): Promise<readonly ListingPhoto[]> {
    return Promise.resolve(this.shownPhotos.get(listingId) ?? []);
  }

  /** States the marketplace reports; listings not in it count as drafts. */
  readonly states = new Map<string, ListingState | 'deleted'>();

  state(listingId: string): Promise<ListingState | undefined> {
    const state = this.states.get(listingId) ?? 'draft';
    return Promise.resolve(state === 'deleted' ? undefined : state);
  }

  publish(listingId: string): Promise<void> {
    if (this.failOn === 'publish') return Promise.reject(new Error('no payment method'));
    this.published.push(listingId);
    this.states.set(listingId, 'active');
    return Promise.resolve();
  }
}

/** Imports a listing once {@link importListing} is called, like a provider's store sync. */
export class FakePrintSync implements PrintSync {
  readonly uploads: { url: string; name: string }[] = [];
  readonly links = new Map<string, VariantLink>();
  private readonly imported = new Map<string, readonly SyncedVariant[]>();

  importListing(marketplaceId: string, productIds: readonly string[]): void {
    this.imported.set(
      marketplaceId,
      productIds.map((productId) => ({ id: `sv-${productId}`, productId })),
    );
  }

  syncedVariants(marketplaceId: string): Promise<readonly SyncedVariant[] | undefined> {
    return Promise.resolve(this.imported.get(marketplaceId));
  }

  uploadPrintFile(url: string, name: string): Promise<string> {
    this.uploads.push({ url, name });
    return Promise.resolve(`file-${this.uploads.length}`);
  }

  linkVariant(syncedVariantId: string, link: VariantLink): Promise<void> {
    this.links.set(syncedVariantId, link);
    return Promise.resolve();
  }

  /** Pictures of the linked files, for imported listings only. */
  readonly shownPreviews = new Map<string, readonly PrintPreview[]>();

  previews(marketplaceId: string): Promise<readonly PrintPreview[] | undefined> {
    if (!this.imported.has(marketplaceId)) return Promise.resolve(undefined);
    return Promise.resolve(this.shownPreviews.get(marketplaceId) ?? []);
  }
}

export class InMemoryListings implements ListingRepository {
  private readonly byId = new Map<string, Listing>();

  save(listing: Listing): Promise<void> {
    const clash = [...this.byId.values()].find(
      (other) =>
        other.id !== listing.id &&
        (other.designId === listing.designId || other.marketplaceId === listing.marketplaceId),
    );
    if (clash) return Promise.reject(new ConflictError(`Listing ${clash.id} is in the way`));
    this.byId.set(listing.id, listing);
    return Promise.resolve();
  }

  remove(id: ListingId): Promise<void> {
    this.byId.delete(id);
    return Promise.resolve();
  }

  findByDesign(designId: DesignId): Promise<Listing | undefined> {
    return Promise.resolve(
      [...this.byId.values()].find((listing) => listing.designId === designId),
    );
  }
}

/**
 * Writes predictable text from the brief, "translates" by tagging the language
 * and hands back revised text unchanged.
 */
export class FakeCopywriter implements ListingCopywriter {
  readonly briefs: CopyBrief[] = [];
  readonly revisions: { readonly problems: readonly string[]; readonly language: string }[] = [];

  write(brief: CopyBrief): Promise<ListingText> {
    this.briefs.push(brief);
    const name = brief.conceptName ?? 'Artwork';
    return Promise.resolve({
      title: `${name} ${brief.productType}`,
      description: `A ${brief.productType} with ${name}.`,
      tags: [brief.productType, ...brief.keywords.map((word) => word.term)],
    });
  }

  translate(text: ListingText, language: string): Promise<ListingText> {
    return Promise.resolve({
      title: `[${language}] ${text.title}`,
      description: `[${language}] ${text.description}`,
      tags: text.tags,
    });
  }

  revise(text: ListingText, problems: readonly string[], language: string): Promise<ListingText> {
    this.revisions.push({ problems, language });
    return Promise.resolve(text);
  }
}

/** Sees every image as the same small PNG. */
export class FakeImagePreviews implements ImagePreviews {
  readonly image: PreviewImage = { data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png' };

  preview(): Promise<PreviewImage> {
    return Promise.resolve(this.image);
  }
}

export const SAMPLE_FACTS: ProductFacts = {
  material: '100% cotton',
  care: 'Machine wash cold',
  fit: '',
  size: '',
};

/** The same facts for every product. */
export class FakeProductFacts implements ProductFactsSource {
  constructor(private readonly facts: ProductFacts = SAMPLE_FACTS) {}

  factsFor(): Promise<ProductFacts> {
    return Promise.resolve(this.facts);
  }
}
