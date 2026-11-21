import { assertConceptKey, ConflictError, type Concept, type ConceptRepository } from '@pod/core';
import type { SqliteDatabase } from './database.js';
import type { Gate } from './gates.js';
import { text, toConcept } from './rows.js';

export class SqliteConceptRepository implements ConceptRepository {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly gate: Gate,
  ) {}

  findByKey(key: string): Promise<Concept | undefined> {
    return this.gate(() => {
      const row = this.db.prepare('SELECT * FROM concepts WHERE key = ?').get(key);
      return row ? toConcept(row) : undefined;
    });
  }

  save(concept: Concept): Promise<void> {
    return this.gate(() => {
      assertConceptKey(concept.key);
      this.db.atomically(() => {
        this.assertNoConflict(concept);
        this.db
          .prepare(
            `INSERT INTO concepts (id, key, name, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
          )
          .run(concept.id, concept.key, concept.name, concept.createdAt.toISOString());
      });
    });
  }

  private assertNoConflict(concept: Concept): void {
    const sameId = this.db.prepare('SELECT key FROM concepts WHERE id = ?').get(concept.id);
    if (sameId && text(sameId, 'key') !== concept.key) {
      throw new ConflictError(`Concept ${concept.id} is stored under key ${text(sameId, 'key')}`);
    }
    const sameKey = this.db.prepare('SELECT id FROM concepts WHERE key = ?').get(concept.key);
    if (sameKey && text(sameKey, 'id') !== concept.id) {
      throw new ConflictError(`Concept key ${concept.key} belongs to ${text(sameKey, 'id')}`);
    }
  }
}
