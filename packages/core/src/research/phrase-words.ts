/** The words of a phrase research counts, which are joined by single spaces. */
export const wordsOf = (term: string): string[] => term.split(' ');

export const wordCount = (term: string): number => wordsOf(term).length;

/** Whether every id of `inner` is in `outer`. */
export function isSubsetOf(inner: ReadonlySet<string>, outer: ReadonlySet<string>): boolean {
  return [...inner].every((id) => outer.has(id));
}
