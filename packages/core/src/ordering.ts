/**
 * Compares strings by UTF-16 code units. For the ASCII keys the catalog uses
 * this matches SQLite's BINARY collation, and unlike `localeCompare` it never
 * depends on the machine's locale, so results and fingerprints are reproducible.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Leading number of a design key: `07-mug` gives 7, `120-tote-bag` gives 120. */
export function conceptNumberOf(designKey: string): number {
  const match = /^\d+/.exec(designKey);
  return match ? Number.parseInt(match[0], 10) : 0;
}

/**
 * Catalog order: by concept number, so `99-mug` comes before `100-mug`, then by
 * design key, which puts a concept's products in alphabetical order of their
 * family id. Every catalog implementation must list designs in this order.
 */
export function compareDesignKeys(a: string, b: string): number {
  return conceptNumberOf(a) - conceptNumberOf(b) || compareCodeUnits(a, b);
}
