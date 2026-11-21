import type { BatchItem, BatchJob, BatchJobId, StoredBatch } from '../batch/batch-job.js';

/** Keeps the latest batch job and how far each of its designs got. */
export interface BatchRepository {
  /** The latest job; `undefined` before the first. */
  current(): Promise<StoredBatch | undefined>;
  /** Keeps `batch` as the only job, in place of any earlier one. */
  replace(batch: StoredBatch): Promise<void>;
  saveJob(job: BatchJob): Promise<void>;
  /** Updates one design of the job; the design must belong to it. */
  saveItem(jobId: BatchJobId, item: BatchItem): Promise<void>;
}
