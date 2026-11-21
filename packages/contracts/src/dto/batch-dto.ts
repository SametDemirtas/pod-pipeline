import type { ResearchMarket } from './research-dto.js';
import type { ApiErrorPayload } from '../errors.js';
import type { ListingTextDto } from './listing-dto.js';

/** What preparing listings does for each design, in the order it does it. */
export const BATCH_STEPS = ['upscale', 'print', 'mockups', 'research', 'text', 'draft'] as const;
export type BatchStepDto = (typeof BATCH_STEPS)[number];

/** `paused` after the app closed while the job ran; `finished` once no design waits. */
export const BATCH_JOB_STATES = ['running', 'paused', 'cancelled', 'finished'] as const;
export type BatchJobStateDto = (typeof BATCH_JOB_STATES)[number];

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
export type BatchStepStateDto = (typeof BATCH_STEP_STATES)[number];

/** Designs a job holds at most. */
export const MAX_BATCH_DESIGNS = 1000;

/**
 * A design that stopped, with the error the app would show for its step, or
 * one whose draft may be on Etsy, which waits until the seller has checked.
 */
export interface BatchFailureDto {
  readonly designId: string;
  readonly designKey: string;
  readonly step: BatchStepDto;
  readonly error: ApiErrorPayload;
  /** Why Etsy may hold the design's draft; `null` when it may not. */
  readonly draftCheck: ApiErrorPayload | null;
}

export interface BatchJobDto {
  readonly id: string;
  readonly state: BatchJobStateDto;
  readonly steps: readonly BatchStepDto[];
  /** The Etsy market whose saved research and imported keyword lists give the keywords. */
  readonly market: ResearchMarket;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly designs: number;
  /** Designs with no step left to run, however they ended. */
  readonly settledDesigns: number;
  /** For each step of the job, how many designs are in each state. */
  readonly stepCounts: Readonly<
    Partial<Record<BatchStepDto, Readonly<Record<BatchStepStateDto, number>>>>
  >;
  /** The design and step running now; `null` while nothing runs. */
  readonly current: { readonly designKey: string; readonly step: BatchStepDto } | null;
  readonly failures: readonly BatchFailureDto[];
}

/** The latest job of preparing listings; `null` before the first. */
export interface BatchStatusDto {
  readonly job: BatchJobDto | null;
}

/** Listing text a job wrote for a design, kept until its draft is made. */
export interface BatchListingTextDto extends ListingTextDto {
  /** The shop's main language when it was written, which the text is in. */
  readonly language: string;
  /** Into the shop's other languages. */
  readonly translations: readonly (ListingTextDto & { readonly language: string })[];
}

/** What a job would do, counted before it starts, leaving out work already done. */
export interface BatchEstimateDto {
  readonly designs: number;
  /** Free; they read Printful's print areas. */
  readonly printChecks: number;
  /** Free, but Printful makes one task at a time and limits how many it takes. */
  readonly mockupTasks: number;
  /** Requests to the text AI: one to write and one per translation, each maybe revised once. */
  readonly textRequests: { readonly min: number; readonly max: number };
  /** The service and model that write the text and bill the seller's key. */
  readonly textService: string;
  readonly textModel: string;
  /** The shop's languages the text is written in, the main one first. */
  readonly languages: readonly string[];
  /** Unpublished Etsy drafts; Etsy charges only when one is published. */
  readonly drafts: number;
  /** Designs whose draft may be on Etsy, which get none until the seller checked the shop. */
  readonly draftsWaiting: number;
  /**
   * Products whose drafts lack a price, with the sizes the settings list
   * without one; empty without the draft step.
   */
  readonly missingPrices: readonly {
    readonly familyId: string;
    readonly sizes: readonly string[];
  }[];
  /** The shipping profile drafts of each product use; empty without the draft step. */
  readonly shipping: readonly BatchShippingDto[];
}

export interface BatchShippingDto {
  readonly familyId: string;
  /** The profile's name; `null` when there is none to use. */
  readonly profile: string | null;
  /** Why there is none: the one chosen left the shop, or the shop has no profile. */
  readonly missing: 'gone' | 'none' | null;
}
