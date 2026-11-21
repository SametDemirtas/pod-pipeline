import type { LocalImage } from './downloads.js';
import type { ProductFamilyId } from '../catalog/product-family.js';
import type { ListingState } from '../listing/listing.js';
import type { ListingText } from '../listing/listing-text.js';

export interface ShopOption {
  readonly id: string;
  readonly label: string;
}

/** What a new listing must or may refer to in the seller's shop. */
export interface ShopOptions {
  readonly shopName: string;
  /** ISO 4217 code, e.g. `USD`; listing prices are in its minor unit. */
  readonly currency: string;
  /** Decimal places of the currency, e.g. 2 for USD and 0 for JPY. */
  readonly currencyDigits: number;
  readonly shippingProfiles: readonly ShopOption[];
  readonly readinessStates: readonly ShopOption[];
  readonly returnPolicies: readonly ShopOption[];
  readonly productionPartners: readonly ShopOption[];
  /** Languages buyers can read the shop in; the first is the one listings are written in. */
  readonly languages: readonly string[];
}

/** Addresses of listings on the marketplace's website. */
export interface MarketplaceLinks {
  /** The listing as buyers see it. */
  listingUrl(marketplaceId: string): string;
  /** The listing in the seller's editor. */
  editUrl(marketplaceId: string): string;
  /** The shop's drafts, where one the app lost track of shows up. */
  draftsUrl(): string;
}

export interface MarketplaceShop {
  options(): Promise<ShopOptions>;
}

/** The seller's choices that every listing of the shop needs. */
export interface ListingSetup {
  readonly shippingProfileId: string;
  readonly readinessStateId: string;
  readonly returnPolicyId?: string | undefined;
  readonly productionPartnerIds: readonly string[];
}

export interface NewListing extends ListingSetup {
  readonly familyId: ProductFamilyId;
  readonly text: ListingText;
  /** Price shown before a variation is picked, in the minor unit of `currency`. */
  readonly price: number;
  /** ISO 4217 code the prices were entered in; refused once it is no longer the shop's. */
  readonly currency: string;
}

export interface ProductOptions {
  readonly readinessStateId: string;
  /** ISO 4217 code of the products' prices, as for a {@link NewListing}. */
  readonly currency: string;
}

export interface ListingProperty {
  readonly name: string;
  readonly value: string;
}

export interface ListingProduct {
  readonly sku: string;
  readonly properties: readonly ListingProperty[];
  /** In the currency's minor unit. */
  readonly price: number;
}

export interface CreatedProduct {
  readonly sku: string;
  readonly productId: string;
}

/** A photo as the marketplace shows it on the listing. */
export interface ListingPhoto {
  readonly url: string;
  /** A small copy, for showing many at once. */
  readonly thumbnailUrl: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface MarketplaceListings {
  /**
   * Creates an unpublished listing and resolves to its id. When the
   * marketplace may have made it without the app learning its id, e.g. the
   * answer broke off, this rejects with `DraftUnconfirmedError`; any other
   * error means no draft was made.
   */
  createDraft(listing: NewListing): Promise<string>;
  /** Replaces the listing's variations; resolves with the id given to every product. */
  setProducts(
    listingId: string,
    products: readonly ListingProduct[],
    options: ProductOptions,
  ): Promise<readonly CreatedProduct[]>;
  /** Stores the listing's words in another of the shop's languages. */
  setTranslation(listingId: string, language: string, text: ListingText): Promise<void>;
  /** Adds the photos in order; the first becomes the main photo. */
  addImages(listingId: string, images: readonly LocalImage[]): Promise<void>;
  /**
   * Replaces every photo of the listing with these, in order; the first becomes
   * the main photo. The photos are made ready before the old ones are removed.
   */
  replaceImages(listingId: string, images: readonly LocalImage[]): Promise<void>;
  remove(listingId: string): Promise<void>;
  /** The photos the listing has now, main photo first. */
  photos(listingId: string): Promise<readonly ListingPhoto[]>;
  /** The listing's state on the marketplace; `undefined` once it was deleted there. */
  state(listingId: string): Promise<ListingState | undefined>;
  /** Makes the listing public; the marketplace may charge a fee. */
  publish(listingId: string): Promise<void>;
}
