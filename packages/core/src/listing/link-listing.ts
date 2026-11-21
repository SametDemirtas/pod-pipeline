import { requireDesign } from '../catalog/catalog-queries.js';
import {
  ListingNotSyncedError,
  NotFoundError,
  PrintFileMissingError,
  PrintProductUnavailableError,
  PrintVariantUnavailableError,
} from '../errors.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { FileHost } from '../ports/file-host.js';
import type { ListingRepository } from '../ports/listings.js';
import type { PrintCatalog } from '../ports/print-provider.js';
import { uprightTarget, type OrientationSupport } from '../print/upright-target.js';
import type { PrintSync, SyncedVariant } from '../ports/print-sync.js';
import type { Clock } from '../ports/system.js';
import type { Design, DesignView } from '../catalog/model.js';
import { designFileToShare } from '../print/design-file.js';
import { placeImage } from '../print/placement.js';
import type { PrintProduct } from '../print/print-product.js';
import { isLinkCurrent, type Listing } from './listing.js';
import { requireListing } from './require-listing.js';

export interface LinkOptions {
  /**
   * Links again although the listing is linked to the current revision, e.g.
   * after the provider lost the link; only a person asks for this.
   */
  readonly again?: boolean;
}

export interface LinkListingDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly printCatalog: PrintCatalog;
  readonly listings: Pick<ListingRepository, 'findByDesign' | 'save'>;
  readonly printSync: Pick<PrintSync, 'syncedVariants' | 'uploadPrintFile' | 'linkVariant'>;
  readonly fileHost: FileHost;
  readonly assets: AssetLocator;
  readonly clock: Clock;
  /**
   * Whether the provider takes a print area turned a quarter; with it, artwork
   * of the other orientation than the area is printed upright on the turned
   * area instead of turned. Without it the current revision goes on the area as listed.
   */
  readonly orientation?: OrientationSupport | undefined;
}

/**
 * Tells the print provider, for every product of a design's listing, which
 * variant to make and with which print file. The provider must have imported
 * the listing from the shop first, which it does on its own once store sync is on.
 * A listing already linked to the current revision is left as it is unless
 * asked `again`. A retry reuses the print file uploaded for that revision,
 * until the provider says it no longer has it.
 */
export class LinkListing {
  /** The provider's file id of each design revision uploaded, by `designId@revision` of the file sent. */
  private readonly uploaded = new Map<string, string>();

  constructor(private readonly deps: LinkListingDeps) {}

  async execute(designId: string, options: LinkOptions = {}): Promise<Listing> {
    const { design, revisions } = await requireDesign(this.deps.query, designId);
    const listing = await requireListing(this.deps.listings, design.id);
    if (!options.again && isLinkCurrent(listing, design.revision)) return listing;
    const product = await this.deps.printCatalog.findProduct(design.familyId);
    if (!product) throw new PrintProductUnavailableError(design.familyId);

    // Every area is found before anything is uploaded or linked, so a variant
    // the provider stopped making leaves no listing half linked.
    const targets = await Promise.all(
      (await this.syncedTargets(listing)).map(async (target) => {
        const area = areaOf(product, target.link.variantId, listing.printArea);
        const upright = await uprightTarget(
          design,
          revisions,
          { productId: product.productId, variantId: target.link.variantId, area },
          this.deps.orientation,
        );
        return upright
          ? { ...target, source: upright.source, area: upright.area }
          : { ...target, source: design, area };
      }),
    );
    const fileIds = new Map<number, string>();
    try {
      for (const { link, syncedVariantId, source, area } of targets) {
        let fileId = fileIds.get(source.revision);
        if (!fileId) {
          fileId = await this.printFile(design, source);
          fileIds.set(source.revision, fileId);
        }
        await this.deps.printSync.linkVariant(syncedVariantId, {
          variantId: link.variantId,
          fileId,
          area,
          placement: placeImage(source.asset, area, listing.fit),
        });
      }
    } catch (error) {
      if (error instanceof PrintFileMissingError) {
        for (const revision of fileIds.keys()) this.uploaded.delete(uploadKey(design, revision));
      }
      throw error;
    }

    const linked: Listing = {
      ...listing,
      designRevision: design.revision,
      linkedAt: this.deps.clock.now(),
    };
    await this.deps.listings.save(linked);
    return linked;
  }

  /** The provider's file id of `source`, a revision of `design`, uploaded once. */
  private async printFile(design: DesignView, source: Design): Promise<string> {
    const key = uploadKey(design, source.revision);
    const known = this.uploaded.get(key);
    if (known) return known;
    const file = designFileToShare(design, this.deps.assets, source);
    const shared = await this.deps.fileHost.share(file);
    try {
      const fileId = await this.deps.printSync.uploadPrintFile(shared.url, file.name);
      this.uploaded.set(key, fileId);
      return fileId;
    } finally {
      // Once stored, the provider keeps its own copy, so the link is no longer needed.
      await shared.release().catch(() => undefined);
    }
  }

  /** Pairs every product with the provider's copy of it, once all of them were imported. */
  private async syncedTargets(listing: Listing) {
    const synced = await this.deps.printSync.syncedVariants(listing.marketplaceId);
    return listing.products.map((link) => {
      const copy = synced?.find((variant: SyncedVariant) => variant.productId === link.productId);
      if (!copy) throw new ListingNotSyncedError(listing.marketplaceId);
      return { link, syncedVariantId: copy.id };
    });
  }
}

const uploadKey = (design: DesignView, revision: number) => `${design.id}@${String(revision)}`;

function areaOf(product: PrintProduct, variantId: string, printArea: string) {
  // The provider's catalog leaves out variants it has out of stock.
  const variant = product.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new PrintVariantUnavailableError(variantId);
  const area = variant.areas.find((candidate) => candidate.placement === printArea);
  if (!area) throw new NotFoundError('Print area', `${printArea} of variant ${variantId}`);
  return area;
}
