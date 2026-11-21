import type { ListingRules } from '@pod/rules';
import { requireDesign } from '../catalog/catalog-queries.js';
import { ListingNotDraftError, ValidationError } from '../errors.js';
import { requirePublishablePhoto } from '../mockups/require-mockup.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { ListingRepository } from '../ports/listings.js';
import type { MarketplaceListings } from '../ports/marketplace.js';
import type { MockupStore } from '../ports/mockups.js';
import type { Listing } from './listing.js';
import { requireListing } from './require-listing.js';

export interface ReplaceListingPhotosInput {
  readonly designId: string;
  /** Photos in the order buyers see them; the first is the main photo. */
  readonly mockupIds: readonly string[];
}

export interface ReplaceListingPhotosDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly listings: Pick<ListingRepository, 'findByDesign'>;
  readonly mockups: Pick<MockupStore, 'listForDesign'>;
  readonly assets: AssetLocator;
  readonly marketplace: Pick<MarketplaceListings, 'state' | 'replaceImages'>;
  readonly rules: Pick<ListingRules, 'photos'>;
}

/**
 * Swaps the photos of the design's unpublished draft for the chosen ones, e.g.
 * after the mockups were made again. A published listing keeps its photos:
 * buyers would see it without any while they are swapped. Scenes are left to
 * a new draft, whose description then gets the note that photos are AI-made.
 */
export class ReplaceListingPhotos {
  constructor(private readonly deps: ReplaceListingPhotosDeps) {}

  async execute(input: ReplaceListingPhotosInput): Promise<Listing> {
    const { design } = await requireDesign(this.deps.query, input.designId);
    const listing = await requireListing(this.deps.listings, design.id);
    checkPhotoIds(input.mockupIds, this.deps.rules.photos);
    const stored = await this.deps.mockups.listForDesign(design.id);
    const photos = input.mockupIds.map((id) => {
      const photo = requirePublishablePhoto(stored, id, 'mockupIds', design.revision);
      if (photo.scenePrompt !== null) {
        throw new ValidationError(
          'mockupIds',
          `scene ${id} needs the AI note in the description; add scenes to a new draft`,
        );
      }
      return photo;
    });
    if (listing.state !== 'draft') {
      throw new ListingNotDraftError(listing.marketplaceId, listing.state);
    }
    // The seller may have published or deleted the draft on the marketplace since.
    const state = await this.deps.marketplace.state(listing.marketplaceId);
    if (state !== 'draft') {
      throw new ListingNotDraftError(listing.marketplaceId, state ?? 'deleted');
    }

    await this.deps.marketplace.replaceImages(
      listing.marketplaceId,
      photos.map(({ asset }) => ({
        absolutePath: this.deps.assets.pathOf(asset.storageKey),
        mimeType: asset.mimeType,
      })),
    );
    return listing;
  }
}

function checkPhotoIds(ids: readonly string[], most: number): void {
  if (ids.length === 0) throw new ValidationError('mockupIds', 'choose at least one');
  if (ids.length > most) {
    throw new ValidationError('mockupIds', `choose at most ${most}`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('mockupIds', 'lists an id twice');
  }
}
