import {
  type AiCatalogDto,
  type BatchEstimateDto,
  type BatchRequest,
  type BatchStepDto,
  type CatalogApi,
  type DesignDto,
} from '@pod/contracts';
import { missingPricesOf, providerPhotos, shippingOf } from '@pod/rules';
import { keptText, missingText, type BatchItem, type PreparedText } from '@pod/core';
import { batchDesign } from './batch-designs.js';
import type { SettingsStore } from '../settings/settings-store.js';

export interface BatchEstimateDeps {
  readonly catalog: Pick<CatalogApi, 'listMockups' | 'getListing' | 'getShopOptions' | 'getDesign'>;
  readonly settings: Pick<SettingsStore, 'get'>;
  readonly aiCatalog: AiCatalogDto;
}

/** Requests the text of one design takes: writing it and each missing translation. */
function textRequests(languages: readonly string[], prepared: PreparedText | null): number {
  const { kept, translations } = missingText(prepared, languages);
  return (kept ? 0 : 1) + translations.length;
}

interface DesignCount {
  readonly mockups: boolean;
  readonly text: number;
  readonly draft: boolean;
  readonly waiting: boolean;
}

interface CountContext {
  readonly request: BatchRequest;
  readonly languages: readonly string[];
  readonly earlier: (designId: string) => BatchItem | undefined;
  readonly unchecked: ReadonlySet<string>;
}

/** What the job would do for one design, leaving out what is there already. */
async function countDesign(
  deps: BatchEstimateDeps,
  design: DesignDto,
  { request, languages, earlier, unchecked }: CountContext,
): Promise<DesignCount> {
  const wants = (step: BatchStepDto) => request.steps.includes(step);
  const listingSteps = wants('text') || wants('draft');
  const [mockups, listing] = await Promise.all([
    wants('mockups') ? deps.catalog.listMockups({ id: design.id }) : [],
    listingSteps ? deps.catalog.getListing({ id: design.id }) : null,
  ]);
  // Text written for artwork imported since describes other artwork.
  const kept = earlier(design.id);
  const text = kept?.text ? keptText(await batchDesign(deps.catalog, design), kept) : null;
  return {
    mockups: wants('mockups') && providerPhotos(mockups, design.revision).length === 0,
    text: wants('text') && !listing ? textRequests(languages, text) : 0,
    draft: wants('draft') && !listing && !unchecked.has(design.id),
    // A draft that may be on Etsy waits for the seller to check the shop.
    waiting: wants('draft') && !listing && unchecked.has(design.id),
  };
}

/**
 * Counts what the job would do, leaving out what is there already: Printful
 * photos of the current revision, text an earlier job wrote and designs with
 * a listing. Keywords come from saved research and imported lists, so they
 * cost nothing and take no time. Each text request may be
 * revised once, so the most is twice the least.
 */
export async function estimateBatch(
  deps: BatchEstimateDeps,
  designs: readonly DesignDto[],
  request: BatchRequest,
  earlier: (designId: string) => BatchItem | undefined,
  unchecked: ReadonlySet<string>,
): Promise<BatchEstimateDto> {
  const wants = (step: BatchStepDto) => request.steps.includes(step);
  const listingSteps = wants('text') || wants('draft');
  const [settings, shop] = await Promise.all([
    deps.settings.get(),
    listingSteps ? deps.catalog.getShopOptions() : undefined,
  ]);
  const languages = shop?.languages ?? [];
  const counted = await Promise.all(
    designs.map((design) =>
      countDesign(deps, design, {
        request,
        languages,
        earlier,
        unchecked,
      }),
    ),
  );
  const text = counted.reduce((sum, design) => sum + design.text, 0);
  return {
    designs: designs.length,
    printChecks: wants('print') ? designs.length : 0,
    mockupTasks: counted.filter((design) => design.mockups).length,
    textRequests: { min: text, max: 2 * text },
    textService: deps.aiCatalog[settings.textProvider].service,
    textModel: settings.textModel,
    languages,
    drafts: counted.filter((design) => design.draft).length,
    draftsWaiting: counted.filter((design) => design.waiting).length,
    missingPrices:
      shop && wants('draft')
        ? missingPricesOf(
            settings,
            shop.currency,
            designs.map((design) => design.familyId),
          )
        : [],
    shipping:
      shop && wants('draft')
        ? shippingOf(
            shop,
            settings.shippingProfiles,
            designs.map((design) => design.familyId),
          )
        : [],
  };
}
