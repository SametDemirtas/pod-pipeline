import type {
  ApiErrorPayload,
  BatchEstimateDto,
  BatchListingTextDto,
  BatchRequest,
  BatchStatusDto,
  CatalogApi,
  DesignDto,
  DesignIdRequest,
} from '@pod/contracts';
import {
  checkedItem,
  draftMayExist,
  interrupted,
  newBatchItem,
  retriedItem,
  type DraftCheck,
  type BatchItem,
  type BatchJob,
  type BatchJobId,
  type BatchRepository,
  type Clock,
  type DesignId,
  type IdGenerator,
} from '@pod/core';
import { BATCH_STEPS } from '@pod/rules';
import { BatchInProgressError } from '../errors/batch-errors.js';
import { DraftMayExistError } from '../errors/listing-errors.js';
import { AppClosingError } from '../../shared/app-error.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import { batchDesign, selectedDesigns } from './batch-designs.js';
import { BatchState, type BatchEvents } from './batch-state.js';
import { toBatchListingTextDto } from './batch-status.js';
import { BatchWorker } from './batch-worker.js';
import { remembered } from './remembered.js';
import type { BatchRun, BatchSteps } from './step-runner.js';
import type { UncheckedDrafts } from './unchecked-drafts.js';

export type BatchApi = Pick<CatalogApi, 'getBatchStatus'>;

/**
 * What a job would do for the designs, given what an earlier job prepared for
 * each and the designs whose draft may be on Etsy.
 */
type EstimateBatch = (
  designs: readonly DesignDto[],
  request: BatchRequest,
  earlier: (designId: string) => BatchItem | undefined,
  unchecked: ReadonlySet<string>,
) => Promise<BatchEstimateDto>;

export interface BatchServiceDeps {
  readonly jobs: BatchRepository;
  readonly drafts: Pick<UncheckedDrafts, 'keep' | 'list' | 'pruneAndList' | 'clear'>;
  readonly catalog: Pick<CatalogApi, 'listDesigns' | 'getDesign' | 'getShopOptions'>;
  readonly steps: BatchSteps;
  readonly estimate: EstimateBatch;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The error as the window would show it, so a failed step reads the same. */
  readonly describeError: (error: unknown) => ApiErrorPayload;
  readonly events: BatchEvents;
  readonly logError: (error: unknown) => void;
}

/**
 * Prepares listings for many designs in the background, one design and one
 * step at a time, through the same operations the window uses, so their
 * locks, pacing and checks apply. The job and each design's progress are
 * stored after every step, so a restart resumes where it stopped. Only the
 * window starts, cancels, resumes or retries a job.
 */
export class BatchService implements BatchApi {
  private readonly state: BatchState;
  private readonly worker: BatchWorker;
  private running: Promise<void> | undefined;
  private stop: AbortController | undefined;
  private closed = false;
  /** Cancelling while a run is being started; the run then does not begin. */
  private cancelAsked = false;
  // Starting, resuming and retrying read the job before changing it, so one at a time.
  private readonly control = new ExclusiveRunner(() => new BatchInProgressError());

  constructor(private readonly deps: BatchServiceDeps) {
    this.state = new BatchState({
      jobs: deps.jobs,
      events: deps.events,
      unconfirmed: () => this.unconfirmed(),
    });
    this.worker = new BatchWorker({ ...deps, state: this.state });
  }

  /**
   * Reads the stored job. A job the app closed during is paused, and its step
   * then runs again, except a draft, which may be on Etsy anyway, so that
   * design waits for the seller to check.
   */
  async recover(): Promise<void> {
    const stored = await this.deps.jobs.current();
    await this.deps.drafts.pruneAndList();
    if (!stored) return;
    const unconfirmed = this.unconfirmed();
    const items = stored.items.map((item) => interrupted(item, unconfirmed));
    const state = stored.job.state === 'running' ? 'paused' : stored.job.state;
    const batch = { job: { ...stored.job, state }, items };
    const changed =
      state !== stored.job.state || items.some((item, index) => item !== stored.items[index]);
    if (changed) await this.state.replace(batch);
    else this.state.hold(batch);
  }

  getBatchStatus(): Promise<BatchStatusDto> {
    return Promise.resolve(this.state.status());
  }

  async estimateBatch(request: BatchRequest): Promise<BatchEstimateDto> {
    const [designs, checks] = await Promise.all([
      selectedDesigns(this.deps.catalog, request.selection),
      this.deps.drafts.list(),
    ]);
    return this.deps.estimate(
      designs,
      request,
      (designId) => this.state.earlier(designId),
      new Set(checks.keys()),
    );
  }

  /** Starts a job in place of the previous one, keeping text that job wrote. */
  startBatch(request: BatchRequest): Promise<BatchStatusDto> {
    return this.change(async () => {
      const designs = await selectedDesigns(this.deps.catalog, request.selection);
      const earlier = (id: string) => this.state.earlier(id);
      await this.deps.drafts.keep(this.state.latest()?.items ?? []);
      const checks = await this.deps.drafts.pruneAndList();
      const steps = BATCH_STEPS.filter((step) => request.steps.includes(step));
      const job: BatchJob = {
        id: this.deps.ids.next() as BatchJobId,
        state: 'running',
        steps,
        market: request.market,
        createdAt: this.deps.clock.now(),
        finishedAt: null,
      };
      const items = await Promise.all(
        designs.map(async (design) =>
          newBatchItem(
            await batchDesign(this.deps.catalog, design),
            steps,
            earlier(design.id),
            checks.get(design.id as DesignId) ?? null,
          ),
        ),
      );
      this.assertOpen();
      await this.state.replace({ job, items });
      return this.start();
    });
  }

  /**
   * Stops a running job once the step running now is done, so no draft is
   * left half made; one still being started stops at once. A paused job stays
   * paused, as only resuming starts it again.
   */
  async cancelBatch(): Promise<BatchStatusDto> {
    this.assertOpen();
    this.cancelAsked = true;
    this.stop?.abort();
    const job = this.state.latest()?.job;
    if (job?.state === 'running') await this.state.saveJob({ ...job, state: 'cancelled' });
    return this.state.status();
  }

  resumeBatch(): Promise<BatchStatusDto> {
    return this.change(async () => {
      await this.state.unstick();
      await this.state.saveJob({ ...this.state.stored().job, state: 'running', finishedAt: null });
      return this.start();
    });
  }

  retryBatch(): Promise<BatchStatusDto> {
    return this.change(async () => {
      await this.state.unstick();
      const { job, items } = this.state.stored();
      for (const item of items) {
        if (item.failure) await this.state.saveItem(retriedItem(item));
      }
      await this.state.saveJob({ ...job, state: 'running', finishedAt: null });
      return this.start();
    });
  }

  /**
   * The seller checked the shop's drafts for the design, so its draft may be
   * created again; a run going on reaches it, others once resumed.
   */
  confirmDraftsChecked(request: DesignIdRequest): Promise<BatchStatusDto> {
    return this.control.run(async () => {
      this.assertOpen();
      await this.deps.drafts.clear(request.id as DesignId);
      const item = this.state.earlier(request.id);
      if (item && draftMayExist(item)) await this.state.saveItem(checkedItem(item));
      return this.state.status();
    });
  }

  /**
   * The text the latest job wrote for the design, for the window's listing form;
   * it may have been written for an earlier revision the seller turned or upscaled since.
   */
  getBatchListingText(request: DesignIdRequest): Promise<BatchListingTextDto | null> {
    const prepared = this.state.earlier(request.id)?.text;
    return Promise.resolve(prepared ? toBatchListingTextDto(prepared) : null);
  }

  /** Refuses new jobs and resolves once a run being started and the step running now are stored. */
  async close(): Promise<void> {
    this.closed = true;
    this.stop?.abort();
    await this.control.close();
    await this.running;
  }

  /** Starts, resumes or retries a job: one at a time, never while a run goes on or once closing. */
  private change(start: () => Promise<BatchStatusDto>): Promise<BatchStatusDto> {
    return this.control.run(() => {
      this.assertOpen();
      if (this.running) throw new BatchInProgressError();
      this.cancelAsked = false;
      return start();
    });
  }

  private async start(): Promise<BatchStatusDto> {
    this.assertOpen();
    const { job } = this.state.stored();
    if (this.cancelAsked) {
      await this.state.saveJob({ ...job, state: 'cancelled' });
      return this.state.status();
    }
    const stop = new AbortController();
    this.stop = stop;
    const run: BatchRun = { job, shop: remembered(() => this.deps.catalog.getShopOptions()) };
    this.running = this.worker.run(run, stop.signal).finally(() => {
      this.running = undefined;
      this.state.runEnded();
    });
    return this.state.status();
  }

  /** Preparing a run takes a while, during which the app may begin to close. */
  private assertOpen(): void {
    if (this.closed) throw new AppClosingError();
  }

  private unconfirmed(): DraftCheck {
    return { step: 'draft', ...this.deps.describeError(new DraftMayExistError()) };
  }
}
