import type { CatalogApi, ShopOptionsDto } from '@pod/contracts';
import type { BatchItem, BatchJob, BatchStep, Clock } from '@pod/core';
import type { ListingRules } from '@pod/rules';
import type { KeywordListService } from '../research/keyword-list-service.js';
import type { SettingsStore } from '../settings/settings-store.js';
import type { TextService } from '../listing/text-service.js';
import type { RotationService } from '../print/rotation-service.js';
import type { UpscaleService } from '../print/upscale-service.js';
import type { Wait } from './busy-waits.js';

/** What a step prepared for the design's later steps, e.g. a larger artwork's revision. */
type Prepared = Partial<Pick<BatchItem, 'designRevision' | 'keywords' | 'text'>>;

/** `skipped` when the work was there before; a failure may still have prepared part of it. */
export type StepOutcome =
  | { readonly state: 'done' | 'skipped'; readonly prepared?: Prepared }
  | { readonly state: 'failed'; readonly error: unknown; readonly prepared: Prepared };

/** What the steps of one run share: its job, and the shop's options read once for it. */
export interface BatchRun {
  readonly job: BatchJob;
  readonly shop: () => Promise<ShopOptionsDto>;
}

export type StepRunner = (
  item: BatchItem,
  run: BatchRun,
  signal: AbortSignal,
) => Promise<StepOutcome>;

export type BatchSteps = Readonly<Record<BatchStep, StepRunner>>;

/** The operations steps reuse, with the locks and pacing the services keep. */
export type BatchCatalog = Pick<
  CatalogApi,
  | 'getDesign'
  | 'checkPrint'
  | 'createMockups'
  | 'listMockups'
  | 'getListing'
  | 'createListing'
  | 'listResearch'
  | 'getResearch'
>;

export interface BatchStepsDeps {
  readonly catalog: BatchCatalog;
  /** Keyword lists the seller imported; the batch never searches Etsy itself. */
  readonly keywordLists: Pick<KeywordListService, 'listKeywordLists' | 'getKeywordList'>;
  readonly text: Pick<TextService, 'writeListingText' | 'translateListingText'>;
  readonly upscale: Pick<UpscaleService, 'upscaleDesign'>;
  readonly rotation: Pick<RotationService, 'rotateDesign'>;
  readonly settings: Pick<SettingsStore, 'get'>;
  readonly clock: Clock;
  readonly wait: Wait;
  /** How many photos a draft takes. */
  readonly rules: Pick<ListingRules, 'photos'>;
}

export const DONE: StepOutcome = { state: 'done' };
export const SKIPPED: StepOutcome = { state: 'skipped' };
