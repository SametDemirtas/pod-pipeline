import { beforeEach, expect } from 'vitest';
import type {
  CatalogQuery,
  ConceptRepository,
  DesignListFilter,
  DesignRepository,
  UnitOfWork,
} from '../../ports/catalog-repositories.js';
import { conceptKeyOf, sampleConcept, sampleDesign } from './samples.js';

export interface CatalogPersistence {
  readonly concepts: ConceptRepository;
  readonly designs: DesignRepository;
  readonly query: CatalogQuery;
  readonly unitOfWork: UnitOfWork;
}

export type PersistenceFactory = () => Promise<CatalogPersistence> | CatalogPersistence;

/** Gives each test a fresh store plus helpers to fill and page through it. */
export interface ContractStore {
  readonly current: CatalogPersistence;
  /** Concepts get a sample name unless `conceptNames` gives one, or `null` for none. */
  seed(designKeys: readonly string[], conceptNames?: Record<string, string | null>): Promise<void>;
  collect(limit: number, filter?: DesignListFilter): Promise<string[]>;
}

export function useContractStore(createPersistence: PersistenceFactory): ContractStore {
  let store: CatalogPersistence | undefined;

  beforeEach(async () => {
    store = await createPersistence();
  });

  const current = (): CatalogPersistence => {
    if (!store) throw new Error('The contract store is only available inside a test');
    return store;
  };

  return {
    get current() {
      return current();
    },
    async seed(designKeys, conceptNames = {}) {
      const conceptKeys = new Set(designKeys.map(conceptKeyOf));
      for (const key of conceptKeys) {
        if (!(await current().concepts.findByKey(key))) {
          await current().concepts.save(sampleConcept(key, conceptNames[key]));
        }
      }
      for (const key of designKeys) await current().designs.save(sampleDesign(key));
    },
    async collect(limit, filter = {}) {
      const keys: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 100; pages += 1) {
        const page = await current().query.listDesigns(filter, { limit, cursor });
        expect(page.items.length).toBeLessThanOrEqual(limit);
        keys.push(...page.items.map((item) => item.designKey));
        if (page.nextCursor === null) return keys;
        cursor = page.nextCursor;
      }
      throw new Error('Pagination did not terminate');
    },
  };
}

/** A one-shot event a test fires to let waiting work continue. */
export interface Signal {
  readonly fired: Promise<void>;
  fire(): void;
}

export function signal(): Signal {
  let fire: () => void = () => undefined;
  const fired = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { fired, fire };
}

/** Lets every already queued callback run before the test continues. */
export function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
