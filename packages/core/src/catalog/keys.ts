import { ValidationError } from '../errors.js';

/** Two or three digits, as produced by the import layouts: `01`, `120`. */
const CONCEPT_KEY = /^\d{2,3}$/;
/** Lower-case words joined by hyphens: `mug`, `tote-bag`. */
const FAMILY_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** A concept key and a product family id: `01-mug`, `120-tote-bag`. */
export const DESIGN_KEY = new RegExp(`^\\d{2,3}-${FAMILY_ID.source.slice(1, -1)}$`);

export function designKeyOf(conceptKey: string, familyId: string): string {
  return `${conceptKey}-${familyId}`;
}

export function isFamilyId(value: string): boolean {
  return FAMILY_ID.test(value);
}

export function assertConceptKey(key: string): void {
  if (!CONCEPT_KEY.test(key)) throw new ValidationError('conceptKey', `"${key}" is not valid`);
}

export function assertDesignKey(key: string): void {
  if (!DESIGN_KEY.test(key)) throw new ValidationError('designKey', `"${key}" is not valid`);
}
