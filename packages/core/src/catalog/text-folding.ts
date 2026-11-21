/**
 * Folds case and accents the same way everywhere, whatever the system's
 * language: "İSTANBUL" reads as "istanbul", "Kış" as "kis" and "Straße" as
 * "strasse".
 */
export function foldLetters(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss');
}

/** Folds letters as {@link foldLetters} and reads a hyphen as a space, so "t shirt" finds `01-t-shirt`. */
export function foldForSearch(value: string): string {
  return foldLetters(value).replace(/-/g, ' ');
}

/**
 * Folds case and accents and collapses separators so that "Telefon Kılıfı",
 * "telefon_kilifi" and "TELEFON-KILIFI" compare equal.
 */
export function normalizeLabel(value: string): string {
  return foldForSearch(value)
    .replace(/[\s_.]+/g, ' ')
    .trim();
}
