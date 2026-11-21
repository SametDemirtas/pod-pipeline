import type { BatchStatusDto } from '@pod/contracts';
import {
  NotFoundError,
  interrupted,
  type DraftCheck,
  type BatchItem,
  type BatchJob,
  type BatchRepository,
  type StoredBatch,
} from '@pod/core';
import { toBatchStatusDto, type RunningStep } from './batch-status.js';

export interface BatchEvents {
  /** The job of preparing listings moved on. */
  readonly batchChanged: (status: BatchStatusDto) => void;
}

export interface BatchStateDeps {
  readonly jobs: Pick<BatchRepository, 'replace' | 'saveJob' | 'saveItem'>;
  readonly events: BatchEvents;
  /** Why a draft that was being made when the app stopped may be on Etsy. */
  readonly unconfirmed: () => DraftCheck;
}

/**
 * The latest job as the app holds it. Each change is made here first, so a
 * change under way elsewhere sees it, then stored, then told to the window.
 */
export class BatchState {
  private batch: StoredBatch | undefined;
  /** Designs whose change is held here but was not stored, as storing it failed. */
  private readonly unsaved = new Set<string>();
  /** The design and step running now; `null` while nothing runs. */
  private current: RunningStep | null = null;

  constructor(private readonly deps: BatchStateDeps) {}

  /** Holds `batch` as read at start-up, without storing it again. */
  hold(batch: StoredBatch | undefined): void {
    this.batch = batch;
    this.unsaved.clear();
  }

  /** Keeps `batch` as the only job. */
  async replace(batch: StoredBatch): Promise<void> {
    this.batch = batch;
    this.unsaved.clear();
    await this.deps.jobs.replace(batch);
  }

  /** The job, or `undefined` before the first. */
  latest(): StoredBatch | undefined {
    return this.batch;
  }

  stored(): StoredBatch {
    if (!this.batch) throw new NotFoundError('Batch job', 'latest');
    return this.batch;
  }

  /** The design in the latest job, if it is in it. */
  earlier(designId: string): BatchItem | undefined {
    return this.batch?.items.find((item) => item.designId === designId);
  }

  async saveJob(job: BatchJob): Promise<void> {
    this.batch = { ...this.stored(), job };
    await this.deps.jobs.saveJob(job);
    this.emit();
  }

  async saveItem(item: BatchItem): Promise<void> {
    const { job, items } = this.stored();
    this.batch = {
      job,
      items: items.map((other) => (other.designId === item.designId ? item : other)),
    };
    this.unsaved.add(item.designId);
    await this.deps.jobs.saveItem(job.id, item);
    this.unsaved.delete(item.designId);
    this.emit();
  }

  /**
   * Steps left running when storing their outcome failed, which nothing would
   * run again, and changes held here that were never stored.
   */
  async unstick(): Promise<void> {
    const unconfirmed = this.deps.unconfirmed();
    for (const item of this.stored().items) {
      const settled = interrupted(item, unconfirmed);
      if (settled !== item || this.unsaved.has(item.designId)) await this.saveItem(settled);
    }
  }

  /** Marks `step` as running; the window hears of it once the item's running state is stored. */
  startStep(step: RunningStep): void {
    this.current = step;
  }

  /** Nothing runs any more, which the window is told at once. */
  runEnded(): void {
    this.current = null;
    this.emit();
  }

  status(): BatchStatusDto {
    return toBatchStatusDto(this.batch, this.current);
  }

  private emit(): void {
    this.deps.events.batchChanged(this.status());
  }
}
