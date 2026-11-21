/** The ids of the families the app knows, which the family tables are keyed by. */
export const DEFAULT_FAMILY_IDS = [
  'phone-case',
  'samsung-case',
  'mug',
  'blanket',
  't-shirt',
  'sweatshirt',
  'hoodie',
  'poster',
  'canvas',
  'tote-bag',
  'sticker',
] as const;
export type DefaultFamilyId = (typeof DEFAULT_FAMILY_IDS)[number];

/** The value a table of the default families holds for `familyId`; none for other families. */
export function defaultFamilyValue<T>(
  table: Readonly<Partial<Record<DefaultFamilyId, T>>>,
  familyId: string,
): T | undefined {
  return Object.hasOwn(table, familyId) ? table[familyId as DefaultFamilyId] : undefined;
}
