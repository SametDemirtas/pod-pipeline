import type { DesignId } from '../catalog/model.js';
import { ConflictError, DraftsNotCheckedError } from '../errors.js';
import type { DraftCheckRepository } from '../ports/draft-checks.js';
import { DRAFT_UNCONFIRMED, draftCheckOf } from './draft-checks.js';

/** How making a draft ended when it did not fail in a way that may leave one on Etsy. */
export type DraftOutcome<T> =
  | { readonly kind: 'made'; readonly value: T }
  /** Etsy holds no draft, e.g. it refused the draft or it was removed again. */
  | { readonly kind: 'nothing-left'; readonly error: unknown };

export const draftMade = <T>(value: T): DraftOutcome<T> => ({ kind: 'made', value });
export const nothingLeft = <T>(error: unknown): DraftOutcome<T> => ({
  kind: 'nothing-left',
  error,
});

/**
 * Marks a design before its draft is created and unmarks it only once that
 * ended in a stored listing or with nothing left on Etsy. Any other ending
 * keeps the mark, as a crash does, so no draft is made twice before the
 * seller checked. A design gets one draft made at a time.
 */
export class DraftGuard {
  private readonly running = new Set<DesignId>();

  constructor(
    private readonly checks: Pick<DraftCheckRepository, 'get' | 'set' | 'clear'>,
    /** A mark that could not be updated; the draft's own outcome is reported regardless. */
    private readonly onMarkError: (error: unknown) => void,
  ) {}

  async assertChecked(designId: DesignId): Promise<void> {
    const failure = await this.checks.get(designId);
    if (failure) throw new DraftsNotCheckedError(failure.details);
  }

  /**
   * Runs all the work for one design's draft, its checks included, refusing a
   * second request for the design while the first is under way.
   */
  async exclusive<T>(designId: DesignId, work: () => Promise<T>): Promise<T> {
    if (this.running.has(designId)) {
      throw new ConflictError('A draft of this design is being made', { designId });
    }
    this.running.add(designId);
    try {
      return await work();
    } finally {
      this.running.delete(designId);
    }
  }

  /**
   * Marks the design while `create` asks Etsy for the draft; see the class.
   * An error `create` throws keeps the mark, naming why when Etsy may hold the draft.
   */
  async run<T>(designId: DesignId, create: () => Promise<DraftOutcome<T>>): Promise<T> {
    await this.checks.set(designId, DRAFT_UNCONFIRMED);
    let outcome: DraftOutcome<T>;
    try {
      outcome = await create();
    } catch (error) {
      const failure = draftCheckOf(error) ?? DRAFT_UNCONFIRMED;
      await this.checks.set(designId, failure).catch(this.onMarkError);
      throw error;
    }
    // If clearing fails, the leftover mark only makes the seller check the drafts once more.
    await this.checks.clear(designId).catch(this.onMarkError);
    if (outcome.kind === 'nothing-left') throw outcome.error;
    return outcome.value;
  }
}
