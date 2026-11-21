import { AsyncLocalStorage } from 'node:async_hooks';
import type { Design, DesignDetails, DesignId, DesignView } from '../catalog/model.js';
import { foldForSearch } from '../catalog/text-folding.js';
import { compareDesignKeys } from '../ordering.js';
import {
  decodeDesignCursor,
  encodeDesignCursor,
  type Page,
  type PageRequest,
} from '../pagination.js';
import type {
  CatalogQuery,
  CatalogWriter,
  ConceptRepository,
  DesignListFilter,
  DesignRepository,
  UnitOfWork,
} from '../ports/catalog-repositories.js';
import { copyState, emptyState, stateWriter, type CatalogState } from './in-memory-state.js';

interface Holder {
  active: boolean;
}

/**
 * Reference implementation of the catalog ports, used by unit tests and held
 * to the same contract suite as every persistent implementation.
 */
export class InMemoryCatalog implements CatalogQuery, UnitOfWork {
  readonly concepts: ConceptRepository;
  readonly designs: DesignRepository;
  private state: CatalogState = emptyState();
  private readonly holder = new AsyncLocalStorage<Holder>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor() {
    const writer = stateWriter(
      () => this.state,
      (operation) => this.exclusive(() => Promise.resolve(operation())),
    );
    this.concepts = writer.concepts;
    this.designs = writer.designs;
  }

  run<T>(work: (tx: CatalogWriter) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const draft = copyState(this.state);
      let open = true;
      const tx = stateWriter(
        () => draft,
        (operation) =>
          Promise.resolve().then(() => {
            if (!open) throw new Error('The transaction has already finished');
            return operation();
          }),
      );
      try {
        const result = await work(tx);
        this.state = draft;
        return result;
      } finally {
        open = false;
      }
    });
  }

  listDesigns(filter: DesignListFilter, page: PageRequest): Promise<Page<DesignView>> {
    return this.exclusive(() => {
      const after = page.cursor === undefined ? undefined : decodeDesignCursor(page.cursor);
      const search = filter.search ? foldForSearch(filter.search) : undefined;
      const matching = [...this.state.designs.values()]
        .filter((design) => !filter.familyId || design.familyId === filter.familyId)
        .map((design) => this.view(design))
        .filter(
          (view) =>
            !search ||
            foldForSearch(view.designKey).includes(search) ||
            foldForSearch(view.concept.name ?? '').includes(search),
        )
        .sort((a, b) => compareDesignKeys(a.designKey, b.designKey));

      const remaining =
        after === undefined
          ? matching
          : matching.filter((view) => compareDesignKeys(view.designKey, after) > 0);
      const items = remaining.slice(0, page.limit);
      const last = items.at(-1);
      return Promise.resolve({
        items,
        nextCursor:
          remaining.length > page.limit && last ? encodeDesignCursor(last.designKey) : null,
        total: matching.length,
      });
    });
  }

  getDesign(id: DesignId): Promise<DesignDetails | undefined> {
    return this.exclusive(() => {
      const design = [...this.state.designs.values()].find((candidate) => candidate.id === id);
      if (!design) return Promise.resolve(undefined);
      const revisions = this.state.revisions
        .filter((revision) => revision.id === id)
        .sort((a, b) => b.revision - a.revision);
      return Promise.resolve(structuredClone({ design: this.view(design), revisions }));
    });
  }

  /** Serialises every operation; calls made from inside a running one are refused. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.holder.getStore()?.active) {
      return Promise.reject(
        new Error('The catalog cannot be used from inside another catalog operation'),
      );
    }
    const result = this.tail.then(async () => {
      const holder: Holder = { active: true };
      try {
        return await this.holder.run(holder, work);
      } finally {
        holder.active = false;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  private view(design: Design): DesignView {
    const concept = this.state.concepts.get(design.conceptId);
    if (!concept) throw new Error(`Design ${design.designKey} has no concept`);
    return structuredClone({ ...design, concept });
  }
}
