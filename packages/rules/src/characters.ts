/**
 * Length as Etsy and Pinterest count it: by characters, so an emoji or a
 * letter outside the basic plane is one, not two UTF-16 code units. Text is
 * counted as given; callers trim it first where spaces at the ends do not count.
 */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** Length as a person typing counts it: {@link characterCount}, spaces at the ends left out. */
export function typedCharacterCount(text: string): number {
  return characterCount(text.trim());
}

/** The text cut to `limit` characters, counted as {@link characterCount} counts them. */
export function firstCharacters(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

/**
 * The text cut at the last space that keeps it within `limit` characters, or
 * at the limit itself when that space would lose more than half of it.
 */
export function cutAtWord(text: string, limit: number): string {
  if (characterCount(text) <= limit) return text;
  const cut = firstCharacters(text, limit);
  const space = cut.lastIndexOf(' ');
  return (space > limit / 2 ? cut.slice(0, space) : cut).trim();
}
