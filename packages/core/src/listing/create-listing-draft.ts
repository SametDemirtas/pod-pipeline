import type { ListingRules } from '@pod/rules';
import type { DesignId, DesignView } from '../catalog/model.js';
import { DraftLeftBehindError, ListingExistsError } from '../errors.js';
import type { DesignDisclosure } from '../ports/disclosure.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { ListingRepository } from '../ports/listings.js';
import type { ListingProduct, ListingSetup, MarketplaceListings } from '../ports/marketplace.js';
import type { MockupStore } from '../ports/mockups.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import type { CheckDesignPrint } from '../print/check-design-print.js';
import type { FitMode } from '../print/placement.js';
import type { Mockup } from '../mockups/mockup.js';
import type { PrintVariant } from '../print/print-product.js';
import { requirePublishablePhoto } from '../mockups/require-mockup.js';
import { assertOwnBrand } from './brand-check.js';
import { leavesDraftUnknown } from './draft-checks.js';
import { draftMade, nothingLeft, type DraftGuard, type DraftOutcome } from './draft-guard.js';
import {
  checkSizePrices,
  chosenVariants,
  draftReport,
  productLinks,
  withAiNotes,
  type DraftReport,
  type ListingWords,
} from './draft-parts.js';
import type { Listing, ListingId } from './listing.js';
import { listingProducts } from './listing-products.js';
import type { ListingText, Translation } from './listing-text.js';
import { checkListingInput, checkVariationOptions } from './listing-rules.js';

export type { LanguageAiTell } from './draft-parts.js';

export interface CreateListingDraftInput extends ListingSetup {
  readonly designId: string;
  readonly printArea?: string | undefined;
  readonly fit: string;
  /** BCP 47 tag of the language `text` is in, the shop's main one, e.g. `en-US`. */
  readonly language: string;
  readonly text: ListingText;
  /** Price of every variant without a size price, in the minor unit of `currency`. */
  readonly price: number;
  /** ISO 4217 code of the shop currency the prices were entered in. */
  readonly currency: string;
  /** Prices by size, e.g. a higher one for 2XL; same unit as `price`. */
  readonly sizePrices?: Readonly<Record<string, number>> | undefined;
  readonly variantIds: readonly string[];
  /** Photos in the order buyers see them; the first is the main photo. */
  readonly mockupIds: readonly string[];
  /** The words in the shop's other languages. */
  readonly translations?: readonly Translation[] | undefined;
}

export interface CreatedListingDraft extends DraftReport {
  readonly listing: Listing;
}

export interface CreateListingDraftDeps {
  readonly checkPrint: Pick<CheckDesignPrint, 'execute'>;
  readonly mockups: Pick<MockupStore, 'listForDesign'>;
  readonly assets: AssetLocator;
  readonly marketplace: Pick<
    MarketplaceListings,
    'createDraft' | 'setProducts' | 'setTranslation' | 'addImages' | 'remove'
  >;
  readonly listings: Pick<ListingRepository, 'findByDesign' | 'save'>;
  readonly disclosure: DesignDisclosure;
  /** Keeps a design from getting a second draft while Etsy may hold one. */
  readonly guard: DraftGuard;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** What the marketplace allows in a listing. */
  readonly rules: ListingRules;
}

/** Everything checked and worked out before Etsy is asked for anything. */
interface PreparedDraft {
  readonly design: DesignView;
  readonly printArea: string;
  readonly fit: FitMode;
  readonly words: ListingWords;
  readonly variants: readonly PrintVariant[];
  readonly products: readonly ListingProduct[];
  readonly photos: readonly Mockup[];
}

/**
 * Creates an unpublished listing with the chosen variants and photos. Either
 * all of it is created or, after a failure, the half-made draft is removed;
 * when even that fails, the error names the draft left in the shop. The
 * trademarks and tells reported are the seller's call, so the draft is made.
 */
export class CreateListingDraft {
  constructor(private readonly deps: CreateListingDraftDeps) {}

  async execute(input: CreateListingDraftInput): Promise<CreatedListingDraft> {
    const { guard } = this.deps;
    // A design is looked up by its id, so the id asked for is the design's own.
    const designId = input.designId as DesignId;
    return guard.exclusive(designId, async () => {
      const draft = await this.prepare(input);
      const listing = await guard.run(designId, () => this.create(input, draft));
      return { listing, ...draftReport(draft.words, input.language, draft.design.concept.name) };
    });
  }

  private async prepare(input: CreateListingDraftInput): Promise<PreparedDraft> {
    const checked = checkListingInput(input, this.deps.rules);
    const { design, product, area, check } = await this.deps.checkPrint.execute({
      designId: input.designId,
      variantId: input.variantIds[0],
      printArea: input.printArea,
      fit: input.fit,
    });
    const existing = await this.deps.listings.findByDesign(design.id);
    if (existing) throw new ListingExistsError(design.id, existing.marketplaceId);
    assertOwnBrand(design.familyId, [checked.text, ...checked.translations.map((t) => t.text)]);
    await this.deps.guard.assertChecked(design.id);

    const variants = chosenVariants(product, input.variantIds, area.placement);
    checkVariationOptions(variants, this.deps.rules);
    checkSizePrices(variants, input.sizePrices);
    const stored = await this.deps.mockups.listForDesign(design.id);
    const photos = input.mockupIds.map((id) =>
      requirePublishablePhoto(stored, id, 'mockupIds', design.revision),
    );
    const use = {
      scenes: photos.some((photo) => photo.scenePrompt !== null),
      designs: await this.deps.disclosure.designsMadeWithAi(),
    };
    const words = withAiNotes(checked, input.language, use, this.deps.rules);
    return {
      design,
      printArea: area.placement,
      fit: check.fit,
      words,
      variants,
      products: listingProducts(variants, input.price, input.sizePrices),
      photos,
    };
  }

  /** Makes the draft and stores the listing; anything after storing it cannot undo it. */
  private async create(
    input: CreateListingDraftInput,
    draft: PreparedDraft,
  ): Promise<DraftOutcome<Listing>> {
    const { marketplace } = this.deps;
    let marketplaceId: string;
    try {
      marketplaceId = await marketplace.createDraft({
        familyId: draft.design.familyId,
        text: draft.words.text,
        price: input.price,
        currency: input.currency,
        shippingProfileId: input.shippingProfileId,
        readinessStateId: input.readinessStateId,
        returnPolicyId: input.returnPolicyId,
        productionPartnerIds: input.productionPartnerIds,
      });
    } catch (error) {
      if (leavesDraftUnknown(error)) throw error;
      return nothingLeft(error);
    }
    try {
      const listing = await this.fill(marketplaceId, input, draft);
      await this.deps.listings.save(listing);
      return draftMade(listing);
    } catch (error) {
      // The draft is free and invisible, but one the app does not know about would
      // confuse the seller and block nothing from making a second one.
      try {
        await marketplace.remove(marketplaceId);
      } catch {
        throw new DraftLeftBehindError(marketplaceId, error);
      }
      return nothingLeft(error);
    }
  }

  private async fill(
    marketplaceId: string,
    input: CreateListingDraftInput,
    draft: PreparedDraft,
  ): Promise<Listing> {
    const { marketplace, assets } = this.deps;
    const created = await marketplace.setProducts(marketplaceId, draft.products, {
      readinessStateId: input.readinessStateId,
      currency: input.currency,
    });
    await marketplace.addImages(
      marketplaceId,
      draft.photos.map(({ asset }) => ({
        absolutePath: assets.pathOf(asset.storageKey),
        mimeType: asset.mimeType,
      })),
    );
    for (const { language, text } of draft.words.translations) {
      await marketplace.setTranslation(marketplaceId, language, text);
    }
    return {
      id: this.deps.ids.next() as ListingId,
      designId: draft.design.id,
      designRevision: draft.design.revision,
      marketplaceId,
      state: 'draft',
      printArea: draft.printArea,
      fit: draft.fit,
      products: productLinks(draft.variants, created),
      linkedAt: null,
      createdAt: this.deps.clock.now(),
      publishedAt: null,
    };
  }
}
