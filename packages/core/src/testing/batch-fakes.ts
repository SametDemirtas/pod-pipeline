import type { BatchItem, BatchJob, BatchJobId, StoredBatch } from '../batch/batch-job.js';
import type { DesignId } from '../catalog/model.js';
import type { BatchRepository } from '../ports/batch.js';
import type { DraftCheck } from '../listing/draft-checks.js';
import type { DraftCheckRepository } from '../ports/draft-checks.js';

export class InMemoryBatches implements BatchRepository {
  private batch: StoredBatch | undefined;

  current(): Promise<StoredBatch | undefined> {
    return Promise.resolve(this.batch);
  }

  replace(batch: StoredBatch): Promise<void> {
    this.batch = batch;
    return Promise.resolve();
  }

  saveJob(job: BatchJob): Promise<void> {
    if (this.batch?.job.id !== job.id) return Promise.reject(new Error(`No job ${job.id}`));
    this.batch = { ...this.batch, job };
    return Promise.resolve();
  }

  saveItem(jobId: BatchJobId, item: BatchItem): Promise<void> {
    const batch = this.batch;
    if (batch?.job.id !== jobId || !batch.items.some((other) => other.designId === item.designId)) {
      return Promise.reject(new Error(`No design ${item.designId} in job ${jobId}`));
    }
    this.batch = {
      ...batch,
      items: batch.items.map((other) => (other.designId === item.designId ? item : other)),
    };
    return Promise.resolve();
  }
}

export class InMemoryDraftChecks implements DraftCheckRepository {
  private readonly checks = new Map<DesignId, DraftCheck>();

  all(): Promise<ReadonlyMap<DesignId, DraftCheck>> {
    return Promise.resolve(new Map(this.checks));
  }

  get(designId: DesignId): Promise<DraftCheck | undefined> {
    return Promise.resolve(this.checks.get(designId));
  }

  set(designId: DesignId, check: DraftCheck): Promise<void> {
    this.checks.set(designId, check);
    return Promise.resolve();
  }

  clear(designId: DesignId): Promise<void> {
    this.checks.delete(designId);
    return Promise.resolve();
  }
}
