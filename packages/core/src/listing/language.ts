/** The primary subtag of a BCP 47 tag in lower case, e.g. `de` for `de-AT`. */
export function primaryLanguage(tag: string): string {
  return String(tag.toLowerCase().split(/[-_]/)[0]);
}
