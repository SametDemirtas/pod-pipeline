import type {
  CatalogQuery,
  CatalogWriter,
  ConceptRepository,
  DesignRepository,
  UnitOfWork,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, TransactionGate, type Gate } from './gates.js';
import { SqliteCatalogQuery } from './sqlite-catalog-query.js';
import { SqliteConceptRepository } from './sqlite-concept-repository.js';
import { SqliteDesignRepository } from './sqlite-design-repository.js';

/** The catalog ports on one SQLite database: repositories, queries and transactions. */
export class SqliteCatalog implements UnitOfWork {
  readonly concepts: ConceptRepository;
  readonly designs: DesignRepository;
  readonly query: CatalogQuery;

  constructor(private readonly db: SqliteDatabase) {
    const locked = lockedGate(db);
    this.concepts = new SqliteConceptRepository(db, locked);
    this.designs = new SqliteDesignRepository(db, locked);
    this.query = new SqliteCatalogQuery(db);
  }

  run<T>(work: (tx: CatalogWriter) => Promise<T>): Promise<T> {
    return this.db.transaction(async () => {
      const gate = new TransactionGate();
      try {
        return await work(this.writer(gate.run));
      } finally {
        gate.close();
      }
    });
  }

  private writer(gate: Gate): CatalogWriter {
    return {
      concepts: new SqliteConceptRepository(this.db, gate),
      designs: new SqliteDesignRepository(this.db, gate),
    };
  }
}
