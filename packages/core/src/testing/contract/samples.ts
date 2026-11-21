import type { Concept, ConceptId, Design, DesignId } from '../../catalog/model.js';
import { productFamilyId } from '../../catalog/product-family.js';

const CREATED_AT = '2026-03-01T10:00:00.000Z';

export function sampleConcept(key: string, name: string | null = `Concept ${key}`): Concept {
  return { id: `concept-${key}` as ConceptId, key, name, createdAt: new Date(CREATED_AT) };
}

/** Concept part of a design key: `01-mug` gives `01`. */
export function conceptKeyOf(designKey: string): string {
  return /^\d+/.exec(designKey)?.[0] ?? designKey;
}

/** Family part of a design key: `01-tote-bag` gives `tote-bag`. */
function familyOf(designKey: string): string {
  return designKey.slice(designKey.indexOf('-') + 1);
}

/** A design whose concept and family are read from its key, e.g. `01-mug`. */
export function sampleDesign(
  designKey: string,
  overrides: Partial<Omit<Design, 'designKey'>> = {},
): Design {
  return {
    id: `design-${designKey}` as DesignId,
    designKey,
    conceptId: `concept-${conceptKeyOf(designKey)}` as ConceptId,
    familyId: productFamilyId(familyOf(designKey)),
    revision: 1,
    asset: {
      sha256: `sha-${designKey}`,
      storageKey: `assets/sha-${designKey}`,
      mimeType: 'image/png',
      width: 3840,
      height: 1648,
      byteSize: 1024,
    },
    sourcePath: `/designs/${designKey}.png`,
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(CREATED_AT),
    ...overrides,
  };
}
