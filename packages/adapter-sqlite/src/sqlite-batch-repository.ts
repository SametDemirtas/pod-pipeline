import {
  BATCH_JOB_STATES,
  type BatchFailure,
  type DraftCheck,
  type BatchItem,
  type BatchJob,
  type BatchJobId,
  type BatchJobState,
  type BatchKeyword,
  type BatchRepository,
  type DesignId,
  type PreparedText,
  type StoredBatch,
} from '@pod/core';
import { BATCH_STEPS } from '@pod/rules';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { date, integer, marketRegion, optionalText, text, type Row } from './rows.js';

const JOB_STATES: ReadonlySet<string> = new Set(BATCH_JOB_STATES);
const STEPS: ReadonlySet<string> = new Set(BATCH_STEPS);

export class SqliteBatchRepository implements BatchRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  current(): Promise<StoredBatch | undefined> {
    return this.gate(() => {
      const job = this.db.prepare('SELECT * FROM batch_jobs LIMIT 1').get();
      if (!job) return undefined;
      const items = this.db
        .prepare('SELECT * FROM batch_items WHERE job_id = ? ORDER BY position')
        .all(text(job, 'id'))
        .map(toItem);
      return { job: toJob(job), items };
    });
  }

  replace(batch: StoredBatch): Promise<void> {
    return this.gate(() => {
      this.db.atomically(() => {
        this.db.prepare('DELETE FROM batch_jobs').run();
        this.db
          .prepare(
            `INSERT INTO batch_jobs (id, state, steps_json, market, created_at, finished_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(...jobValues(batch.job));
        const insert = this.db.prepare(
          `INSERT INTO batch_items (
             job_id, position, design_id, design_key, design_revision,
             steps_json, failure_json, draft_check_json, keywords_json, text_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        batch.items.forEach((item, position) => {
          insert.run(
            batch.job.id,
            position,
            item.designId,
            item.designKey,
            item.designRevision,
            ...progressValues(item),
          );
        });
      });
    });
  }

  saveJob(job: BatchJob): Promise<void> {
    return this.gate(() => {
      const [, state, , , , finishedAt] = jobValues(job);
      const { changes } = this.db
        .prepare('UPDATE batch_jobs SET state = ?, finished_at = ? WHERE id = ?')
        .run(state, finishedAt, job.id);
      if (changes === 0) throw new Error(`No batch job ${job.id}`);
    });
  }

  saveItem(jobId: BatchJobId, item: BatchItem): Promise<void> {
    return this.gate(() => {
      const { changes } = this.db
        .prepare(
          `UPDATE batch_items
           SET steps_json = ?, failure_json = ?, draft_check_json = ?, keywords_json = ?,
             text_json = ?
           WHERE job_id = ? AND design_id = ?`,
        )
        .run(...progressValues(item), jobId, item.designId);
      if (changes === 0) throw new Error(`No design ${item.designId} in batch job ${jobId}`);
    });
  }
}

function jobValues(job: BatchJob) {
  return [
    job.id,
    job.state,
    JSON.stringify(job.steps),
    job.market,
    job.createdAt.toISOString(),
    job.finishedAt?.toISOString() ?? null,
  ] as const;
}

function progressValues(item: BatchItem) {
  const json = (value: unknown) => (value === null ? null : JSON.stringify(value));
  return [
    JSON.stringify(item.steps),
    json(item.failure),
    json(item.draftCheck),
    json(item.keywords),
    json(item.text),
  ] as const;
}

function toJob(row: Row): BatchJob {
  const state = text(row, 'state');
  if (!JOB_STATES.has(state)) throw new Error(`Unknown batch job state ${state}`);
  const finishedAt = optionalText(row, 'finished_at');
  return {
    id: text(row, 'id') as BatchJobId,
    state: state as BatchJobState,
    steps: (parsed(row, 'steps_json') as string[]).filter((step) =>
      STEPS.has(step),
    ) as BatchJob['steps'],
    market: marketRegion(row),
    createdAt: date(row, 'created_at'),
    finishedAt: finishedAt === null ? null : date(row, 'finished_at'),
  };
}

function toItem(row: Row): BatchItem {
  return {
    designId: text(row, 'design_id') as DesignId,
    designKey: text(row, 'design_key'),
    designRevision: integer(row, 'design_revision'),
    steps: parsed(row, 'steps_json') as BatchItem['steps'],
    failure: optionalParsed(row, 'failure_json') as BatchFailure | null,
    draftCheck: optionalParsed(row, 'draft_check_json') as DraftCheck | null,
    keywords: optionalParsed(row, 'keywords_json') as BatchKeyword[] | null,
    text: optionalParsed(row, 'text_json') as PreparedText | null,
  };
}

/** Written only by this repository, from values the core built. */
function parsed(row: Row, column: string): unknown {
  return JSON.parse(text(row, column));
}

function optionalParsed(row: Row, column: string): unknown {
  return row[column] === null ? null : parsed(row, column);
}
