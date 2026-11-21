import type { DraftCheck, DesignId, DraftCheckRepository } from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { text, type Row } from './rows.js';

export class SqliteDraftChecks implements DraftCheckRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  all(): Promise<ReadonlyMap<DesignId, DraftCheck>> {
    return this.gate(
      () =>
        new Map(
          this.db
            .prepare('SELECT design_id, failure_json FROM batch_draft_checks')
            .all()
            .map((row) => [text(row, 'design_id') as DesignId, checkOf(row)]),
        ),
    );
  }

  get(designId: DesignId): Promise<DraftCheck | undefined> {
    return this.gate(() => {
      const row = this.db
        .prepare('SELECT failure_json FROM batch_draft_checks WHERE design_id = ?')
        .get(designId);
      return row ? checkOf(row) : undefined;
    });
  }

  set(designId: DesignId, check: DraftCheck): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare(
          `INSERT INTO batch_draft_checks (design_id, failure_json) VALUES (?, ?)
           ON CONFLICT (design_id) DO UPDATE SET failure_json = excluded.failure_json`,
        )
        .run(designId, JSON.stringify(check));
    });
  }

  clear(designId: DesignId): Promise<void> {
    return this.gate(() => {
      this.db.prepare('DELETE FROM batch_draft_checks WHERE design_id = ?').run(designId);
    });
  }
}

/** Written only by this repository, from a check the core built. */
function checkOf(row: Row): DraftCheck {
  return JSON.parse(text(row, 'failure_json')) as DraftCheck;
}
