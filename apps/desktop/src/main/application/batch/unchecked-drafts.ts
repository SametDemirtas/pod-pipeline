import type { CatalogApi } from '@pod/contracts';
import type { DraftCheck, BatchItem, DesignId, DraftCheckRepository } from '@pod/core';

export interface UncheckedDraftsDeps {
  readonly checks: Pick<DraftCheckRepository, 'all' | 'set' | 'clear'>;
  readonly catalog: Pick<CatalogApi, 'getListing'>;
  /** Why a draft that was being made may be on Etsy. */
  readonly unconfirmed: () => DraftCheck;
}

/**
 * The designs whose draft may be on Etsy, kept apart from jobs. Creating a
 * draft marks the design first; the batch only adds what an earlier job knew
 * and drops marks of designs whose listing was stored after all.
 */
export class UncheckedDrafts {
  constructor(private readonly deps: UncheckedDraftsDeps) {}

  /** Keeps the marks of a job's designs whose draft failed or was being made. */
  async keep(items: readonly BatchItem[]): Promise<void> {
    const marked = await this.deps.checks.all();
    for (const item of items) {
      const failure =
        item.draftCheck ?? (item.steps.draft === 'running' ? this.deps.unconfirmed() : null);
      if (failure && !marked.has(item.designId)) {
        await this.deps.checks.set(item.designId, failure);
      }
    }
  }

  list(): Promise<ReadonlyMap<DesignId, DraftCheck>> {
    return this.deps.checks.all();
  }

  /** Drops the marks of designs that have a listing by now, and lists those left. */
  async pruneAndList(): Promise<ReadonlyMap<DesignId, DraftCheck>> {
    const marked = new Map(await this.deps.checks.all());
    for (const designId of marked.keys()) {
      if (await this.deps.catalog.getListing({ id: designId })) {
        await this.deps.checks.clear(designId);
        marked.delete(designId);
      }
    }
    return marked;
  }

  /** The seller checked the shop's drafts for the design. */
  clear(designId: DesignId): Promise<void> {
    return this.deps.checks.clear(designId);
  }
}
