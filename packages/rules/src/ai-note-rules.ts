import { LISTING_LIMITS } from './limits.js';

/** What a listing was made with that buyers are told about in a note on AI. */
export interface AiUse {
  /** Some of the listing's photos are AI scenes. */
  readonly scenes: boolean;
  /** The seller makes designs with AI tools. */
  readonly designs: boolean;
}

/** The note a listing's description ends with, or `null` when nothing needs telling. */
export type AiNoteKind = 'scenes' | 'designs' | 'both';

export function aiNoteKind(use: AiUse): AiNoteKind | null {
  if (use.designs) return use.scenes ? 'both' : 'designs';
  return use.scenes ? 'scenes' : null;
}

/** The longest description the seller may write; a note on AI takes the room left. */
export function descriptionLimit(note: AiNoteKind | null): number {
  return LISTING_LIMITS.description - (note ? LISTING_LIMITS.aiNote : 0);
}
