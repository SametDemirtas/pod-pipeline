import { BATCH_STEPS } from '@pod/rules';
import type { DesignId } from '../catalog/model.js';
import { DRAFT_MAY_EXIST_CODES, type DraftCheck } from '../listing/draft-checks.js';
import type { ListingText, Translation } from '../listing/listing-text.js';
import type { MarketRegion } from '../research/market.js';

/** What a batch does for each design, in the order of `BATCH_STEPS`. */
export type BatchStep = (typeof BATCH_STEPS)[number];

export type BatchJobId = string & { readonly __brand: 'BatchJobId' };

/** `paused` after the app closed while the job ran; `finished` once no design waits. */
export const BATCH_JOB_STATES = ['running', 'paused', 'cancelled', 'finished'] as const;
export type BatchJobState = (typeof BATCH_JOB_STATES)[number];

/**
 * `skipped` when the work was there before, e.g. mockups made earlier;
 * `blocked` when an earlier step of the design failed.
 */
export const BATCH_STEP_STATES = [
  'pending',
  'running',
  'done',
  'skipped',
  'failed',
  'blocked',
] as const;
export type BatchStepState = (typeof BATCH_STEP_STATES)[number];

/** Why a step failed, as the error the app would show for it. */
export interface BatchFailure {
  readonly step: BatchStep;
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** A keyword for the listing writer, in the market it was found in. */
export interface BatchKeyword {
  readonly term: string;
  readonly market?: MarketRegion | undefined;
  readonly suggested?: boolean | undefined;
  /** Shops on the first page using it; left out for a query no result used. */
  readonly shops?: number | undefined;
  /** Monthly searches, from the seller's keyword tool export. */
  readonly searches?: number | undefined;
}

/** Listing text written for a design, kept until its draft is made. */
export interface PreparedText {
  /** The shop's main language, which `text` is in. */
  readonly language: string;
  readonly text: ListingText;
  readonly translations: readonly Translation[];
}

export interface BatchItem {
  readonly designId: DesignId;
  readonly designKey: string;
  /** The revision the job was started for; what was prepared belongs to it. */
  readonly designRevision: number;
  /** One state for each step of the job. */
  readonly steps: Readonly<Partial<Record<BatchStep, BatchStepState>>>;
  readonly failure: BatchFailure | null;
  /**
   * Why Etsy may hold a draft of the design the app does not know of; until
   * the seller has checked, its draft step stays failed, whatever else fails
   * or is retried, also in later jobs.
   */
  readonly draftCheck: DraftCheck | null;
  /** `null` until research ran. */
  readonly keywords: readonly BatchKeyword[] | null;
  /** `null` until the text was written. */
  readonly text: PreparedText | null;
}

export interface BatchJob {
  readonly id: BatchJobId;
  readonly state: BatchJobState;
  /** In the order of {@link BATCH_STEPS}. */
  readonly steps: readonly BatchStep[];
  /** The Etsy market whose saved research and imported keyword lists give the keywords. */
  readonly market: MarketRegion;
  readonly createdAt: Date;
  readonly finishedAt: Date | null;
}

/** A job with its designs, in the order they run. */
export interface StoredBatch {
  readonly job: BatchJob;
  readonly items: readonly BatchItem[];
}

export interface BatchDesign {
  readonly id: DesignId;
  readonly designKey: string;
  readonly revision: number;
  /**
   * The newest revision imported rather than made larger or turned in the
   * app; text written for it or a later revision still describes the artwork.
   */
  readonly importedRevision: number;
}

/** The text an earlier job wrote for the same imported artwork, so paid-for text is not written twice. */
export function keptText(design: BatchDesign, earlier: BatchItem | undefined): PreparedText | null {
  if (!earlier) return null;
  const { designRevision } = earlier;
  const sameArtwork =
    designRevision >= design.importedRevision && designRevision <= design.revision;
  return sameArtwork ? earlier.text : null;
}

/**
 * A design's place in a new job, with the {@link keptText} of an earlier job.
 * Keywords are not kept: the new job may use another market, and research goes stale.
 * A draft that may exist on Etsy stays failed until the seller has checked.
 */
export function newBatchItem(
  design: BatchDesign,
  steps: readonly BatchStep[],
  earlier: BatchItem | undefined,
  draftCheck: DraftCheck | null,
): BatchItem {
  return withDraftHeld({
    designId: design.id,
    designKey: design.designKey,
    designRevision: design.revision,
    steps: Object.fromEntries(steps.map((step) => [step, 'pending'])),
    failure: null,
    draftCheck,
    keywords: null,
    text: keptText(design, earlier),
  });
}

/** Whether Etsy may hold a draft of the design the app does not know of. */
export function draftMayExist(item: BatchItem): boolean {
  return item.draftCheck !== null;
}

/** The draft step failed while the seller has not checked the shop's drafts. */
function withDraftHeld(item: BatchItem): BatchItem {
  return item.draftCheck && item.steps.draft !== undefined
    ? withStepState(item, 'draft', 'failed')
    : item;
}

/**
 * The seller checked the shop's drafts, so the draft may be created again:
 * once the design's other failure, if any, is retried.
 */
export function checkedItem(item: BatchItem): BatchItem {
  const failure = item.failure?.step === 'draft' ? null : item.failure;
  const cleared = { ...item, failure, draftCheck: null };
  return item.steps.draft === undefined
    ? cleared
    : withStepState(cleared, 'draft', failure ? 'blocked' : 'pending');
}

/** The steps of `item` in the order they run. */
function itemSteps(item: BatchItem): BatchStep[] {
  return BATCH_STEPS.filter((step) => item.steps[step] !== undefined);
}

/** The step that runs next, or `undefined` when the design is through. */
export function nextStep(item: BatchItem): BatchStep | undefined {
  return itemSteps(item).find((step) => item.steps[step] === 'pending');
}

export function withStepState(item: BatchItem, step: BatchStep, state: BatchStepState): BatchItem {
  return { ...item, steps: { ...item.steps, [step]: state } };
}

/**
 * The design stopped at a failed step; the steps after it cannot run. A
 * failure of a step the job does not run blocks none. A failure after which
 * Etsy may hold a draft is kept until the seller checked.
 */
export function failedItem(item: BatchItem, failure: BatchFailure): BatchItem {
  const steps = itemSteps(item);
  const at = steps.indexOf(failure.step);
  const after = new Set(at < 0 ? [] : steps.slice(at + 1));
  const draftCheck = DRAFT_MAY_EXIST_CODES.some((code) => code === failure.code)
    ? {
        step: 'draft' as const,
        code: failure.code,
        message: failure.message,
        details: failure.details,
      }
    : item.draftCheck;
  return withDraftHeld({
    ...item,
    failure,
    draftCheck,
    steps: Object.fromEntries(
      steps.map((step) => [
        step,
        step === failure.step ? 'failed' : after.has(step) ? 'blocked' : item.steps[step],
      ]),
    ),
  });
}

/** The design with its failed and blocked steps to run again, but a draft that may exist. */
export function retriedItem(item: BatchItem): BatchItem {
  const again = (state: BatchStepState | undefined) =>
    state === 'failed' || state === 'blocked' ? 'pending' : state;
  return withDraftHeld({
    ...item,
    failure: null,
    steps: Object.fromEntries(itemSteps(item).map((step) => [step, again(item.steps[step])])),
  });
}

/**
 * The item after the app stopped while one of its steps ran: that step runs
 * again, except a draft, which may be on Etsy anyway, so it fails with `unconfirmed`.
 */
export function interrupted(item: BatchItem, unconfirmed: BatchFailure): BatchItem {
  const step = itemSteps(item).find((candidate) => item.steps[candidate] === 'running');
  if (!step) return item;
  return step === 'draft' ? failedItem(item, unconfirmed) : withStepState(item, step, 'pending');
}
