/** `text` as regular expression source that matches it literally. */
export function literalPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
