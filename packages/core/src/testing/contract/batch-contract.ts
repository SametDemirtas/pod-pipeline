import { beforeEach, describe, expect, it } from 'vitest';
import {
  failedItem,
  newBatchItem,
  withStepState,
  type BatchJob,
  type BatchJobId,
  type StoredBatch,
} from '../../batch/batch-job.js';
import type { DesignId } from '../../catalog/model.js';
import type { BatchRepository } from '../../ports/batch.js';

function sampleBatch(id: string, designKeys: readonly string[] = ['01-mug']): StoredBatch {
  const job: BatchJob = {
    id: id as BatchJobId,
    state: 'running',
    steps: ['print', 'research', 'text'],
    market: 'DE',
    createdAt: new Date('2026-10-28T09:00:00.000Z'),
    finishedAt: null,
  };
  return {
    job,
    items: designKeys.map((designKey) =>
      newBatchItem(
        { id: `design-${designKey}` as DesignId, designKey, revision: 1, importedRevision: 1 },
        job.steps,
        undefined,
        null,
      ),
    ),
  };
}

/** Behaviour every batch repository must share. */
export function describeBatchContract(
  name: string,
  create: () => Promise<BatchRepository> | BatchRepository,
): void {
  describe(`${name} batch contract`, () => {
    let current: BatchRepository;
    const batches = () => current;

    beforeEach(async () => {
      current = await create();
    });

    describeJobs(batches);
    describeItems(batches);
    describeUnknownWrites(batches);
  });
}

/** Keeping the latest job. */
function describeJobs(batches: () => BatchRepository): void {
  it('has no job before the first', async () => {
    expect(await batches().current()).toBeUndefined();
  });

  it('keeps the job with its designs in order', async () => {
    const batch = sampleBatch('j1', ['02-mug', '01-blanket', '03-phone-case']);
    await batches().replace(batch);

    expect(await batches().current()).toEqual(batch);
  });

  it('keeps only the newest job', async () => {
    await batches().replace(sampleBatch('j1', ['01-mug', '02-mug']));
    const newer = sampleBatch('j2', ['02-mug']);
    await batches().replace(newer);

    expect(await batches().current()).toEqual(newer);
  });

  it('saves the job state', async () => {
    const batch = sampleBatch('j1');
    await batches().replace(batch);
    const finished: BatchJob = {
      ...batch.job,
      state: 'finished',
      finishedAt: new Date('2026-10-28T11:00:00.000Z'),
    };
    await batches().saveJob(finished);

    expect((await batches().current())?.job).toEqual(finished);
  });
}

/** How far each design of the job got. */
function describeItems(batches: () => BatchRepository): void {
  it('saves how far a design got, with what was prepared and why it stopped', async () => {
    const batch = sampleBatch('j1', ['01-mug', '02-mug']);
    await batches().replace(batch);
    const [first, second] = batch.items;
    if (!first || !second) throw new Error('two designs expected');
    const prepared = {
      ...withStepState(first, 'print', 'done'),
      keywords: [
        { term: 'geister tasse', market: 'DE', suggested: true, shops: 4 },
        { term: 'tasse', market: 'DE', suggested: false },
      ],
      text: {
        language: 'de',
        text: { title: 'Geister-Tasse', description: 'Gruselig.', tags: ['geister tasse'] },
        translations: [
          { language: 'en', text: { title: 'Tulip Mug', description: 'Spooky.', tags: [] } },
        ],
      },
    } as const;
    const stopped = failedItem(
      failedItem(second, {
        step: 'text',
        code: 'DRAFT_UNCONFIRMED',
        message: 'may exist',
        details: {},
      }),
      {
        step: 'research',
        code: 'RESEARCH_RATE_LIMITED',
        message: 'wait',
        details: { retryAfterSeconds: 30 },
      },
    );
    await batches().saveItem(batch.job.id, prepared);
    await batches().saveItem(batch.job.id, stopped);

    expect((await batches().current())?.items).toEqual([prepared, stopped]);
  });
}

/** Writes for a design or job the repository does not keep. */
function describeUnknownWrites(batches: () => BatchRepository): void {
  it('refuses to save a design or job it does not keep', async () => {
    const batch = sampleBatch('j1', ['01-mug']);
    await batches().replace(batch);
    const [item] = batch.items;
    if (!item) throw new Error('one design expected');

    await expect(batches().saveItem('j2' as BatchJobId, item)).rejects.toThrow();
    await expect(
      batches().saveItem(batch.job.id, { ...item, designId: 'other' as DesignId }),
    ).rejects.toThrow();
    await expect(batches().saveJob({ ...batch.job, id: 'j2' as BatchJobId })).rejects.toThrow();
  });
}
