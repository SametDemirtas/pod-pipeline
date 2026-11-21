import { characterCount, cutAtWord, type ListingTextRules } from '@pod/rules';
import { AI_NOTE_ROOM } from './ai-note.js';
import { isCapitalWord, uniqueTags, withoutRefused, type ListingText } from './listing-text.js';

/** Keeps the words in capitals the marketplace allows; later ones keep only their first capital. */
function lowerExtraCapitals(title: string, allowed: number): string {
  let capitals = 0;
  return title
    .split(' ')
    .map((word) => {
      if (!isCapitalWord(word)) return word;
      capitals += 1;
      return capitals <= allowed ? word : word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Keeps the first use of a character the marketplace allows once and drops the rest. */
function keepFirst(text: string, character: string): string {
  const at = text.indexOf(character);
  if (at === -1) return text;
  return (
    text.slice(0, at + 1) +
    text
      .slice(at + 1)
      .split(character)
      .join('')
  );
}

/**
 * Makes written text fit the marketplace's rules where that can be done
 * without changing its meaning: characters it refuses are dropped, and a long
 * title or description is cut at a word, the description leaving room for the
 * note about AI. Tags that are too long are left out.
 */
export function fitListingText(text: ListingText, rules: ListingTextRules): ListingText {
  // Line breaks and tabs become spaces first, so the words they separate stay apart.
  let title = withoutRefused(text.title.replace(/\s+/g, ' '), rules.titleCharacters);
  for (const character of rules.onceInTitle) title = keepFirst(title, character);
  title = lowerExtraCapitals(title.replace(/\s+/g, ' ').trim(), rules.capitalWords);
  const tags = uniqueTags(text.tags.map((tag) => withoutRefused(tag, rules.tagCharacters)))
    .filter((tag) => characterCount(tag) <= rules.tagLength)
    .slice(0, rules.tags);
  return {
    title: cutAtWord(title, rules.titleLength),
    description: cutAtWord(text.description.trim(), rules.descriptionLength - AI_NOTE_ROOM),
    tags,
  };
}
