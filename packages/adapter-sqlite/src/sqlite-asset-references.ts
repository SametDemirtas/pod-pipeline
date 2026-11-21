import type { AssetReferences } from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { text } from './rows.js';

const REFERENCED = `
  SELECT storage_key FROM designs
  UNION SELECT storage_key FROM design_revisions
  UNION SELECT storage_key FROM mockups
  UNION SELECT source_storage_key FROM mockups WHERE source_storage_key IS NOT NULL
  UNION SELECT storage_key FROM pins
`;

export class SqliteAssetReferences implements AssetReferences {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  referencedKeys(): Promise<ReadonlySet<string>> {
    return this.gate(
      () =>
        new Set(
          this.db
            .prepare(REFERENCED)
            .all()
            .map((row) => text(row, 'storage_key')),
        ),
    );
  }
}
