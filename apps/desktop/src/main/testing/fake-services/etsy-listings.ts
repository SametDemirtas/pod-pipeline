import { counter, formOf, json, jsonOf, type Answer, type Json } from './http.js';

export interface Listing {
  readonly body: Json;
  products: Json[];
  images: number;
  readonly translations: Set<string>;
}

/** The shop's listings, kept in memory, and the ids Etsy hands out for them. */
export class ListingStore {
  readonly listings = new Map<string, Listing>();
  readonly listingId = counter(1000000001);
  readonly productId = counter(2000000001);
  readonly imageId = counter(3000000001);
  readonly offeringId = counter(4000000001);

  constructor(
    private readonly owner: { readonly userId: number; readonly shopId: number },
    private readonly currency: string,
  ) {}

  /** Answers for the listing named by the path part at `index`, or 404. */
  withListing(
    index: number,
    answer: (
      listing: Listing,
      request: Request,
      params: readonly string[],
    ) => Response | Promise<Response>,
  ): Answer {
    return (request, params) => {
      const id = params[index] ?? '';
      const listing = this.listings.get(id);
      return listing
        ? answer(listing, request, params)
        : json({ error: `Listing ${id} not found` }, 404);
    };
  }

  /** Etsy's money object for a decimal price. */
  price(decimal: unknown): Json {
    return {
      amount: Math.round(Number(decimal) * 100),
      divisor: 100,
      currency_code: this.currency,
    };
  }

  readonly create: Answer = async (request) => {
    const form = await formOf(request);
    const missing = ['quantity', 'title', 'description', 'price', 'who_made', 'when_made'].find(
      (field) => !form.get(field),
    );
    if (missing) return json({ error: `Missing required parameter: ${missing}` }, 400);
    const id = this.listingId();
    const body: Json = {
      listing_id: id,
      user_id: this.owner.userId,
      shop_id: this.owner.shopId,
      title: form.get('title'),
      description: form.get('description'),
      state: 'draft',
      quantity: Number(form.get('quantity')),
      price: this.price(form.get('price')),
      tags: form.get('tags')?.split(',') ?? [],
      taxonomy_id: Number(form.get('taxonomy_id')),
      shipping_profile_id: Number(form.get('shipping_profile_id')),
      return_policy_id: form.has('return_policy_id') ? Number(form.get('return_policy_id')) : null,
      who_made: form.get('who_made'),
      when_made: form.get('when_made'),
      is_supply: form.get('is_supply') === 'true',
      url: `https://www.etsy.com/listing/${String(id)}`,
    };
    this.listings.set(String(id), { body, products: [], images: 0, translations: new Set() });
    return json(body, 201);
  };

  readonly update = this.withListing(1, async (listing, request) => {
    const state = (await formOf(request)).get('state');
    if (state === 'active' && listing.images === 0) {
      return json({ error: 'A listing needs at least one image to be active' }, 400);
    }
    if (state) listing.body['state'] = state;
    return json(listing.body);
  });

  readonly setInventory = this.withListing(0, async (listing, request) => {
    const inventory = await jsonOf(request);
    const products = (inventory['products'] as Json[]).map((product) => ({
      product_id: this.productId(),
      sku: product['sku'] ?? '',
      is_deleted: false,
      property_values: product['property_values'],
      offerings: (product['offerings'] as Json[]).map((offering) => ({
        offering_id: this.offeringId(),
        quantity: offering['quantity'],
        is_enabled: offering['is_enabled'],
        is_deleted: false,
        price: this.price(offering['price']),
        readiness_state_id: offering['readiness_state_id'],
      })),
    }));
    listing.products = products;
    return json({ ...inventory, products });
  });

  readonly addImage = this.withListing(1, async (listing, request) => {
    const form = await request.formData();
    if (!(form.get('image') instanceof Blob)) return json({ error: 'Missing image' }, 400);
    listing.images += 1;
    const imageId = this.imageId();
    return json(
      {
        listing_id: listing.body['listing_id'],
        listing_image_id: imageId,
        rank: Number(form.get('rank') ?? listing.images),
        url_fullxfull: `https://i.etsystatic.com/${String(imageId)}/il_fullxfull.png`,
      },
      201,
    );
  });

  /** A translation's POST, refused when it exists, or its PUT. */
  translation(creates: boolean): Answer {
    return this.withListing(1, async (listing, request, params) => {
      const language = decodeURIComponent(params[2] ?? '');
      if (creates && listing.translations.has(language)) {
        return json({ error: 'A translation for this language already exists' }, 409);
      }
      listing.translations.add(language);
      const form = await formOf(request);
      return json({
        listing_id: listing.body['listing_id'],
        language,
        title: form.get('title'),
        description: form.get('description'),
        tags: form.get('tags')?.split(',') ?? [],
      });
    });
  }

  readonly remove: Answer = (_request, [id = '']) =>
    this.listings.delete(id)
      ? new Response(null, { status: 204 })
      : json({ error: 'Not found' }, 404);

  /** Etsy's product ids of a listing's variations, which Printful imports. */
  productIds(listingId: string): readonly string[] | undefined {
    return this.listings
      .get(listingId)
      ?.products.filter((product) => product['sku'] !== '')
      .map((product) => String(product['product_id']));
  }
}
