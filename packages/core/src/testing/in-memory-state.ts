import { assertValidDesign } from '../catalog/design-validation.js';
import { assertConceptKey } from '../catalog/keys.js';
import type { Concept, ConceptId, Design, DesignId, KeptOrientation } from '../catalog/model.js';
import { ConflictError, NotFoundError } from '../errors.js';
import type { CatalogWriter } from '../ports/catalog-repositories.js';

export interface CatalogState {
  readonly concepts: Map<ConceptId, Concept>;
  readonly designs: Map<string, Design>;
  readonly revisions: Design[];
}

/** Runs a synchronous operation on the state when the caller is allowed to. */
export type Gate = <T>(operation: () => T) => Promise<T>;

export function emptyState(): CatalogState {
  return { concepts: new Map(), designs: new Map(), revisions: [] };
}

export function copyState(state: CatalogState): CatalogState {
  return {
    concepts: new Map(state.concepts),
    designs: new Map(state.designs),
    revisions: [...state.revisions],
  };
}

/** Repositories over whichever state `current` returns, guarded by `gate`. */
export function stateWriter(current: () => CatalogState, gate: Gate): CatalogWriter {
  return {
    concepts: {
      findByKey: (key) => gate(() => copy(findConcept(current(), key))),
      save: (concept) =>
        gate(() => {
          saveConcept(current(), structuredClone(concept));
        }),
    },
    designs: {
      findByKey: (designKey) => gate(() => copy(current().designs.get(designKey))),
      save: (design) =>
        gate(() => {
          saveDesign(current(), structuredClone(design));
        }),
      keepOrientation: (id, kept) =>
        gate(() => {
          keepOrientation(current(), id, structuredClone(kept));
        }),
    },
  };
}

function copy<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function findConcept(state: CatalogState, key: string): Concept | undefined {
  return [...state.concepts.values()].find((concept) => concept.key === key);
}

function saveConcept(state: CatalogState, concept: Concept): void {
  assertConceptKey(concept.key);
  const sameId = state.concepts.get(concept.id);
  if (sameId && sameId.key !== concept.key) {
    throw new ConflictError(`Concept ${concept.id} is stored under key ${sameId.key}`);
  }
  const sameKey = findConcept(state, concept.key);
  if (sameKey && sameKey.id !== concept.id) {
    throw new ConflictError(`Concept key ${concept.key} belongs to ${sameKey.id}`);
  }
  state.concepts.set(concept.id, sameId ? { ...sameId, name: concept.name } : concept);
}

function saveDesign(state: CatalogState, design: Design): void {
  assertValidDesign(design);
  if (!state.concepts.has(design.conceptId)) {
    throw new ConflictError(`Concept ${design.conceptId} does not exist`);
  }
  const current = state.designs.get(design.designKey);
  if (current && current.id !== design.id) {
    throw new ConflictError(`Design key ${design.designKey} belongs to ${current.id}`);
  }
  const sameId = [...state.designs.values()].find((stored) => stored.id === design.id);
  if (sameId && sameId.designKey !== design.designKey) {
    throw new ConflictError(`Design ${design.id} is stored under key ${sameId.designKey}`);
  }
  const expected = (current?.revision ?? 0) + 1;
  if (design.revision !== expected) {
    throw new ConflictError(
      `Design ${design.designKey} must be saved as revision ${expected}, got ${design.revision}`,
    );
  }
  // The advice to leave the artwork unturned belongs to the design, not to a revision.
  const revision: Design = { ...design, createdAt: current?.createdAt ?? design.createdAt };
  // Shaped as a stored revision is: without the design's advice on turning.
  delete (revision as { keptOrientation?: unknown }).keptOrientation;
  const kept = current?.keptOrientation;
  state.designs.set(design.designKey, kept ? { ...revision, keptOrientation: kept } : revision);
  state.revisions.push(revision);
}

function keepOrientation(state: CatalogState, id: DesignId, kept: KeptOrientation): void {
  const design = [...state.designs.values()].find((stored) => stored.id === id);
  if (!design) throw new NotFoundError('Design', id);
  state.designs.set(design.designKey, { ...design, keptOrientation: kept });
}
