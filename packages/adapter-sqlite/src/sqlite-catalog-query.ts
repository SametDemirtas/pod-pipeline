import type { SQLInputValue } from 'node:sqlite';
import {
  conceptNumberOf,
  decodeDesignCursor,
  encodeDesignCursor,
  foldForSearch,
  type CatalogQuery,
  type DesignDetails,
  type DesignId,
  type DesignListFilter,
  type DesignView,
  type Page,
  type PageRequest,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { integer, toDesign, toDesignView } from './rows.js';

const CONCEPT_NUMBER = 'CAST(d.design_key AS INTEGER)';
const FROM_DESIGNS = 'FROM designs d JOIN concepts c ON c.id = d.concept_id';
const DESIGN_VIEW = `
  SELECT d.*, c.key AS concept_key, c.name AS concept_name, c.created_at AS concept_created_at
  ${FROM_DESIGNS}
`;
const REVISIONS = `
  SELECT r.design_id AS id, d.design_key, r.concept_id, r.family_id, r.revision,
         r.sha256, r.storage_key, r.mime_type, r.width, r.height, r.byte_size,
         r.source_path, r.upscale_model, r.upscale_from_sha256, r.rotation,
         r.rotation_from_sha256, r.rotation_reason, d.created_at,
         r.recorded_at AS updated_at
  FROM design_revisions r JOIN designs d ON d.id = r.design_id
  WHERE r.design_id = ?
  ORDER BY r.revision DESC
`;

/** Read side of the catalog. Each call reads under the lock, so it sees one consistent state. */
export class SqliteCatalogQuery implements CatalogQuery {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  listDesigns(filter: DesignListFilter, page: PageRequest): Promise<Page<DesignView>> {
    return this.gate(() => {
      const after = page.cursor === undefined ? undefined : decodeDesignCursor(page.cursor);
      const where: string[] = [];
      const params: SQLInputValue[] = [];
      if (filter.familyId) {
        where.push('d.family_id = ?');
        params.push(filter.familyId);
      }
      if (filter.search) {
        where.push(
          "(casefold(d.design_key) LIKE ? ESCAPE '\\' OR casefold(c.name) LIKE ? ESCAPE '\\')",
        );
        const pattern = `%${escapeLike(foldForSearch(filter.search))}%`;
        params.push(pattern, pattern);
      }

      const totalRow = this.db
        .prepare(`SELECT COUNT(*) AS total ${FROM_DESIGNS} ${whereClause(where)}`)
        .get(...params);

      if (after !== undefined) {
        where.push(`(${CONCEPT_NUMBER} > ? OR (${CONCEPT_NUMBER} = ? AND d.design_key > ?))`);
        const number = conceptNumberOf(after);
        params.push(number, number, after);
      }
      const rows = this.db
        .prepare(
          `${DESIGN_VIEW} ${whereClause(where)} ORDER BY ${CONCEPT_NUMBER}, d.design_key LIMIT ?`,
        )
        .all(...params, page.limit + 1);

      const items = rows.slice(0, page.limit).map(toDesignView);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > page.limit && last ? encodeDesignCursor(last.designKey) : null,
        total: integer(totalRow ?? {}, 'total'),
      };
    });
  }

  getDesign(id: DesignId): Promise<DesignDetails | undefined> {
    return this.gate(() => {
      const row = this.db.prepare(`${DESIGN_VIEW} WHERE d.id = ?`).get(id);
      if (!row) return undefined;
      const revisions = this.db.prepare(REVISIONS).all(id).map(toDesign);
      return { design: toDesignView(row), revisions };
    });
  }
}

function whereClause(conditions: readonly string[]): string {
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
