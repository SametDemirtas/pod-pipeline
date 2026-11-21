import type { KeywordReport, ResearchRepository, ResearchRun, ResearchRunId } from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { date, marketRegion, text, type Row } from './rows.js';

export class SqliteResearchRepository implements ResearchRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  save(run: ResearchRun): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare(
          `INSERT INTO research_runs (id, query, market, created_at, report_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             query = excluded.query,
             market = excluded.market,
             created_at = excluded.created_at,
             report_json = excluded.report_json`,
        )
        .run(
          run.id,
          run.query,
          run.market,
          run.createdAt.toISOString(),
          JSON.stringify(run.report),
        );
    });
  }

  list(limit: number): Promise<readonly ResearchRun[]> {
    return this.gate(() =>
      this.db
        .prepare('SELECT * FROM research_runs ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(limit)
        .map(toRun),
    );
  }

  get(id: ResearchRunId): Promise<ResearchRun | undefined> {
    return this.gate(() => {
      const row = this.db.prepare('SELECT * FROM research_runs WHERE id = ?').get(id);
      return row ? toRun(row) : undefined;
    });
  }

  keepNewest(count: number): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare(
          `DELETE FROM research_runs WHERE id NOT IN (
             SELECT id FROM research_runs ORDER BY created_at DESC, rowid DESC LIMIT ?
           )`,
        )
        .run(count);
    });
  }
}

function toRun(row: Row): ResearchRun {
  return {
    id: text(row, 'id') as ResearchRunId,
    query: text(row, 'query'),
    market: marketRegion(row),
    createdAt: date(row, 'created_at'),
    // Written only by this repository, from a report the core built.
    report: JSON.parse(text(row, 'report_json')) as KeywordReport,
  };
}
