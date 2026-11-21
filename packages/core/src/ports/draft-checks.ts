import type { DraftCheck } from '../listing/draft-checks.js';
import type { DesignId } from '../catalog/model.js';

/**
 * Designs whose draft may be on Etsy without the app knowing, kept apart
 * from jobs, so no later job makes the draft again before the seller checked.
 */
export interface DraftCheckRepository {
  /** Why, by design id. */
  all(): Promise<ReadonlyMap<DesignId, DraftCheck>>;
  /** Why the design waits; `undefined` when it does not. */
  get(designId: DesignId): Promise<DraftCheck | undefined>;
  set(designId: DesignId, check: DraftCheck): Promise<void>;
  /** The seller checked the shop's drafts for the design. */
  clear(designId: DesignId): Promise<void>;
}
