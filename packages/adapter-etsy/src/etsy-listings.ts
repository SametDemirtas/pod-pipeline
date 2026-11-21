import {
  type Clock,
  type CreatedProduct,
  type LocalImage,
  type ListingPhoto,
  type ListingProduct,
  type ListingState,
  type ListingText,
  type MarketplaceListings,
  type NewListing,
  type ProductOptions,
} from '@pod/core';
import { defaultFamilyValue, type DefaultFamilyId } from '@pod/rules';
import { apiPath, mayHaveActed } from '@pod/adapter-http';
import { currencyOf, minorDigits } from './currency.js';
import type { EtsyHttp } from './etsy-client.js';
import { EtsyListingPhotos, type EtsyListingPhotosOptions } from './etsy-listing-photos.js';
import {
  EtsyApiError,
  EtsyCurrencyChangedError,
  EtsyDraftUnconfirmedError,
  EtsyRequestError,
  EtsySignInError,
  UnexpectedEtsyResponseError,
} from './errors.js';
import { inventoryOf, QUANTITY } from './etsy-inventory.js';
import { ETSY_TAXONOMY } from './etsy-taxonomy.js';
import { arrayAt, idAt, objectAt, stringAt } from './json.js';

/**
 * Etsy usually answers in seconds, but a draft made before a timeout cut the
 * answer off would be left behind unknown, so this request waits longer.
 */
const CREATE_DRAFT_TIMEOUT_MS = 120_000;

/**
 * What Etsy asks of every listing, fixed for print on demand: the seller made
 * the design (Etsy's rules for print-on-demand sellers), each item is printed
 * once ordered, and it is a finished physical product, not a craft supply.
 */
const PRINT_ON_DEMAND_LISTING = {
  who_made: 'i_did',
  when_made: 'made_to_order',
  is_supply: 'false',
  type: 'physical',
} as const;

/** How long the shop currency read is trusted, so one draft's requests read it once. */
const CURRENCY_TTL_MS = 10 * 60_000;

export interface EtsyListingsOptions extends EtsyListingPhotosOptions {
  /** Times how long the shop currency read is trusted. */
  readonly clock?: Clock;
  /** The Etsy category of each product family; {@link ETSY_TAXONOMY} by default. */
  readonly taxonomy?: Readonly<Partial<Record<DefaultFamilyId, number>>>;
}

/** Writes draft listings, their variations and photos to the signed-in seller's shop. */
export class EtsyListings implements MarketplaceListings {
  private currency:
    { readonly shopId: string; readonly code: string; readonly at: number } | undefined;
  private readonly clock: Clock;
  private readonly taxonomy: Readonly<Partial<Record<DefaultFamilyId, number>>>;
  private readonly images: EtsyListingPhotos;

  constructor(
    private readonly client: EtsyHttp,
    options: EtsyListingsOptions = {},
  ) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.taxonomy = options.taxonomy ?? ETSY_TAXONOMY;
    this.images = new EtsyListingPhotos(client, options);
  }

  async createDraft(listing: NewListing): Promise<string> {
    const taxonomyId = defaultFamilyValue(this.taxonomy, listing.familyId);
    if (taxonomyId === undefined) {
      throw new EtsyRequestError(`No Etsy category for ${listing.familyId}`);
    }
    const path = apiPath`/shops/${await this.client.shopId()}/listings`;
    const decimal = await this.pricing(listing.currency);
    const form = {
      quantity: String(QUANTITY),
      title: listing.text.title,
      description: listing.text.description,
      price: decimal(listing.price),
      ...PRINT_ON_DEMAND_LISTING,
      taxonomy_id: String(taxonomyId),
      shipping_profile_id: listing.shippingProfileId,
      readiness_state_id: listing.readinessStateId,
      ...(listing.returnPolicyId ? { return_policy_id: listing.returnPolicyId } : {}),
      ...(listing.text.tags.length > 0 ? { tags: listing.text.tags.join(',') } : {}),
      ...(listing.productionPartnerIds.length > 0
        ? { production_partner_ids: listing.productionPartnerIds.join(',') }
        : {}),
    };
    let created: unknown;
    try {
      created = await this.client.post(path, { form }, CREATE_DRAFT_TIMEOUT_MS);
    } catch (error) {
      // A failed token refresh sent nothing to the listings endpoint.
      if (error instanceof EtsySignInError) throw error;
      if (mayHaveActed(error, EtsyApiError)) throw new EtsyDraftUnconfirmedError();
      throw error;
    }
    try {
      return idAt(objectAt(created, 'listing')['listing_id'], 'listing id');
    } catch (error) {
      // Etsy accepted the draft but its id cannot be read, so the app cannot find it again.
      if (error instanceof UnexpectedEtsyResponseError) throw new EtsyDraftUnconfirmedError();
      throw error;
    }
  }

  async setProducts(
    listingId: string,
    products: readonly ListingProduct[],
    options: ProductOptions,
  ): Promise<readonly CreatedProduct[]> {
    const json = inventoryOf(products, {
      readinessStateId: options.readinessStateId,
      decimal: await this.pricing(options.currency),
    });
    const inventory = await this.client.put(apiPath`/listings/${listingId}/inventory`, {
      json,
    });
    return arrayAt(objectAt(inventory, 'inventory')['products'], 'inventory products')
      .map((item) => {
        const product = objectAt(item, 'inventory product');
        return {
          sku: stringAt(product['sku'], 'product sku'),
          productId: idAt(product['product_id'], 'product id'),
        };
      })
      .filter((product) => product.sku !== '');
  }

  /** Creates the translation, or updates it when the listing already has one. */
  async setTranslation(listingId: string, language: string, text: ListingText): Promise<void> {
    const shop = await this.client.shopId();
    const path = apiPath`/shops/${shop}/listings/${listingId}/translations/${language}`;
    const body = {
      form: {
        title: text.title,
        description: text.description,
        ...(text.tags.length > 0 ? { tags: text.tags.join(',') } : {}),
      },
    };
    try {
      await this.client.post(path, body);
    } catch (error) {
      if (!(error instanceof EtsyApiError) || error.status !== 409) throw error;
      await this.client.put(path, body);
    }
  }

  addImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    return this.images.addImages(listingId, images);
  }

  replaceImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    return this.images.replaceImages(listingId, images);
  }

  photos(listingId: string): Promise<readonly ListingPhoto[]> {
    return this.images.photos(listingId);
  }

  async remove(listingId: string): Promise<void> {
    await this.client.delete(apiPath`/listings/${listingId}`);
  }

  async state(listingId: string): Promise<ListingState | undefined> {
    let listing: unknown;
    try {
      listing = await this.client.get(apiPath`/listings/${listingId}`);
    } catch (error) {
      if (error instanceof EtsyApiError && error.status === 404) return undefined;
      throw error;
    }
    const state = stringAt(objectAt(listing, 'listing')['state'], 'listing state');
    // Etsy also says `removed` for a deleted listing it still returns.
    if (state === 'removed') return undefined;
    if (state === 'draft' || state === 'active') return state;
    // `edit` is a short-lived state while the seller changes the listing; it stays active.
    return state === 'edit' ? 'active' : 'inactive';
  }

  async publish(listingId: string): Promise<void> {
    await this.client.patch(apiPath`/shops/${await this.client.shopId()}/listings/${listingId}`, {
      form: { state: 'active' },
    });
  }

  /**
   * Turns prices in the minor unit of `currency` into Etsy's decimals, e.g. 2499 USD into
   * `24.99`. A currency the shop no longer uses is refused.
   */
  private async pricing(currency: string): Promise<(amount: number) => string> {
    const current = await this.shopCurrency();
    if (current !== currency) throw new EtsyCurrencyChangedError(current, currency);
    const digits = minorDigits(currency);
    return (amount) => (amount / 10 ** digits).toFixed(digits);
  }

  private async shopCurrency(): Promise<string> {
    const shopId = await this.client.shopId();
    const known = this.currency;
    const now = this.clock.now().getTime();
    if (known?.shopId === shopId && now - known.at < CURRENCY_TTL_MS) return known.code;
    const code = currencyOf(objectAt(await this.client.get(apiPath`/shops/${shopId}`), 'shop'));
    this.currency = { shopId, code, at: now };
    return code;
  }
}
