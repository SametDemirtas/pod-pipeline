import type {
  KeywordFile,
  KeywordList,
  KeywordListId,
  KeywordListRepository,
  KeywordListSummary,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { date, integer, marketRegion, text, type Row } from './rows.js';

export class SqliteKeywordLists implements KeywordListRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  save(list: KeywordList): Promise<void> {
    const { id, fileName, market, importedAt, figures, keywords, truncated } = list;
    return this.gate(() => {
      this.db
        .prepare(
          `INSERT INTO keyword_lists (id, file_name, market, imported_at, keywords_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             file_name = excluded.file_name,
             market = excluded.market,
             imported_at = excluded.imported_at,
             keywords_json = excluded.keywords_json`,
        )
        .run(
          id,
          fileName,
          market,
          importedAt.toISOString(),
          JSON.stringify({ figures, keywords, truncated }),
        );
    });
  }

  list(): Promise<readonly KeywordListSummary[]> {
    return this.gate(() =>
      this.db
        .prepare(
          `SELECT id, file_name, market, imported_at,
             json_array_length(keywords_json, '$.keywords') AS keyword_count
           FROM keyword_lists ORDER BY imported_at DESC, rowid DESC`,
        )
        .all()
        .map((row) => ({
          id: text(row, 'id') as KeywordListId,
          fileName: text(row, 'file_name'),
          market: marketRegion(row),
          importedAt: date(row, 'imported_at'),
          keywordCount: integer(row, 'keyword_count'),
        })),
    );
  }

  get(id: KeywordListId): Promise<KeywordList | undefined> {
    return this.gate(() => {
      const row = this.db.prepare('SELECT * FROM keyword_lists WHERE id = ?').get(id);
      return row ? toList(row) : undefined;
    });
  }

  remove(id: KeywordListId): Promise<void> {
    return this.gate(() => {
      this.db.prepare('DELETE FROM keyword_lists WHERE id = ?').run(id);
    });
  }
}

function toList(row: Row): KeywordList {
  return {
    id: text(row, 'id') as KeywordListId,
    fileName: text(row, 'file_name'),
    market: marketRegion(row),
    importedAt: date(row, 'imported_at'),
    // Written only by this repository, from a file the core read.
    ...(JSON.parse(text(row, 'keywords_json')) as KeywordFile),
  };
}
