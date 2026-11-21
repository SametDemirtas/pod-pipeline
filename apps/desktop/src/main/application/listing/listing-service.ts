import type {
  CatalogApi,
  CreatedListingDto,
  CreateListingRequest,
  DesignIdRequest,
  LinkListingRequest,
  ListingDto,
  LiveListingPhotosDto,
  ReplaceListingPhotosRequest,
  ShopOptionsDto,
} from '@pod/contracts';
import {
  isLinkCurrent,
  ListingNotSyncedError,
  type CatalogQuery,
  type CreateListingDraft,
  type DesignId,
  type Listing,
  type LinkListing,
  type ListingRepository,
  type LiveListingPhotos,
  type MarketplaceLinks,
  type MarketplaceShop,
  type PublishListing,
  type RefreshListing,
  type ReplaceListingPhotos,
} from '@pod/core';
import { ListingInProgressError, PrintfulWrongStoreError } from '../errors/listing-errors.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toListingDto } from '../dto/listing-dtos.js';
import { KeyedExclusiveRunner } from '../../shared/exclusive-runner.js';
import type { FulfilmentStoreMismatch } from './fulfilment-store-mismatch.js';

export type ListingApi = Pick<
  CatalogApi,
  | 'getShopOptions'
  | 'getListing'
  | 'createListing'
  | 'linkListing'
  | 'refreshListing'
  | 'listingPhotos'
  | 'replaceListingPhotos'
>;

export interface ListingServiceDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly shop: MarketplaceShop;
  readonly links: Pick<MarketplaceLinks, 'draftsUrl' | 'editUrl'>;
  readonly listings: Pick<ListingRepository, 'findByDesign'>;
  readonly createDraft: Pick<CreateListingDraft, 'execute'>;
  readonly link: Pick<LinkListing, 'execute'>;
  readonly publish: Pick<PublishListing, 'execute'>;
  readonly refresh: Pick<RefreshListing, 'execute'>;
  readonly replacePhotos: Pick<ReplaceListingPhotos, 'execute'>;
  readonly livePhotos: Pick<LiveListingPhotos, 'execute'>;
  /** A small copy of a photo Etsy or Printful host, as a data URL; `null` when not to be had. */
  readonly thumbnail: (url: string) => Promise<string | null>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
  /**
   * Why the Printful store cannot take the Etsy shop's listings, asked when
   * Printful has not imported one; `null` when the store looks right.
   */
  readonly fulfilmentStoreMismatch?: (() => Promise<FulfilmentStoreMismatch | null>) | undefined;
}

/** Adapts the listing use cases to the transport-neutral API. */
export class ListingService implements ListingApi {
  // Etsy and Printful changes of a design run one at a time, so a double click
  // cannot make two drafts; other designs need not wait for a slow upload.
  private readonly runner = new KeyedExclusiveRunner(() => new ListingInProgressError());

  constructor(private readonly deps: ListingServiceDeps) {}

  async getShopOptions(): Promise<ShopOptionsDto> {
    return { ...(await this.deps.shop.options()), draftsUrl: this.deps.links.draftsUrl() };
  }

  async getListing(request: DesignIdRequest): Promise<ListingDto | null> {
    const listing = await this.deps.listings.findByDesign(request.id as DesignId);
    return listing ? this.toDto(listing) : null;
  }

  async createListing(request: CreateListingRequest): Promise<CreatedListingDto> {
    const { title, description, tags, translations, ...rest } = request;
    let checks: Pick<CreatedListingDto, 'trademarks' | 'aiTells'> = { trademarks: [], aiTells: [] };
    const listing = await this.change(request.designId, async () => {
      const created = await this.deps.createDraft.execute({
        ...rest,
        text: { title, description, tags },
        translations: translations?.map((translation) => ({
          language: translation.language,
          text: {
            title: translation.title,
            description: translation.description,
            tags: translation.tags,
          },
        })),
      });
      checks = { trademarks: created.trademarks, aiTells: created.aiTells };
      return created.listing;
    });
    return { ...listing, ...checks };
  }

  linkListing(request: LinkListingRequest): Promise<ListingDto> {
    return this.change(request.id, async () => {
      try {
        return await this.deps.link.execute(request.id, { again: request.again === true });
      } catch (error) {
        if (error instanceof ListingNotSyncedError) await this.assertRightStore();
        throw error;
      }
    });
  }

  /**
   * Waiting for store sync does not help when the token belongs to a store
   * that syncs with no Etsy shop, or another one, so that is said instead.
   */
  private async assertRightStore(): Promise<void> {
    const wrong = await this.deps.fulfilmentStoreMismatch?.().catch(() => null);
    if (wrong) throw new PrintfulWrongStoreError(wrong.problem, wrong.storeName, wrong.shopName);
  }

  refreshListing(request: DesignIdRequest): Promise<ListingDto | null> {
    return this.change(request.id, () => this.deps.refresh.execute(request.id));
  }

  /** A photo whose small copy cannot be downloaded keeps its link, with an empty image. */
  async listingPhotos(request: DesignIdRequest): Promise<LiveListingPhotosDto> {
    const live = await this.deps.livePhotos.execute(request.id);
    const marketplace = await Promise.all(
      live.marketplace.map(async (photo) => ({
        url: photo.url,
        image: (await this.deps.thumbnail(photo.thumbnailUrl)) ?? '',
        width: photo.width,
        height: photo.height,
      })),
    );
    const print =
      live.print &&
      (await Promise.all(
        live.print.map(async (preview) => ({
          kind: preview.kind,
          url: preview.url,
          image: (await this.deps.thumbnail(preview.thumbnailUrl)) ?? '',
        })),
      ));
    return { marketplace, print: print ?? null };
  }

  replaceListingPhotos(request: ReplaceListingPhotosRequest): Promise<ListingDto> {
    return this.change(request.designId, () => this.deps.replacePhotos.execute(request));
  }

  /** Window only: publishing costs the seller a fee, so assistants cannot. */
  publishListing(request: DesignIdRequest): Promise<ListingDto> {
    return this.change(request.id, () => this.deps.publish.execute(request.id));
  }

  /** Refuses new changes and resolves once those under way are saved, so the database can close. */
  close(): Promise<void> {
    return this.runner.close();
  }

  private change(designId: string, run: () => Promise<Listing>): Promise<ListingDto>;
  private change(designId: string, run: () => Promise<Listing | null>): Promise<ListingDto | null>;
  private change(designId: string, run: () => Promise<Listing | null>): Promise<ListingDto | null> {
    return this.runner.run(designId, async () => {
      const listing = await run();
      this.deps.events.catalogChanged();
      return listing ? this.toDto(listing) : null;
    });
  }

  private async toDto(listing: Listing): Promise<ListingDto> {
    const details = await this.deps.query.getDesign(listing.designId);
    return toListingDto(listing, {
      editUrl: this.deps.links.editUrl(listing.marketplaceId),
      linkCurrent: details !== undefined && isLinkCurrent(listing, details.design.revision),
    });
  }
}
