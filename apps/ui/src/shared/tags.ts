/** Tags separated by commas or lines, without blanks. */
export function parseTags(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Tags as the seller types them, which {@link parseTags} reads back. */
export function formatTags(tags: readonly string[]): string {
  return tags.join(', ');
}

/** The words already there, then new ones that are not, ignoring case, up to `limit` in all. */
export function mergeTerms(
  current: readonly string[],
  added: readonly string[],
  limit: number,
): string[] {
  const seen = new Set(current.map((term) => term.toLowerCase()));
  const fresh = added.filter((term) => {
    const key = term.toLowerCase();
    return !seen.has(key) && Boolean(seen.add(key));
  });
  return [...current, ...fresh.slice(0, Math.max(0, limit - current.length))];
}
