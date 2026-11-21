import { characterCount, type AllowedCharacters, type ListingTextRules } from '@pod/rules';
import { ValidationError } from '../errors.js';
import { foldLetters } from '../catalog/text-folding.js';

/**
 * The marketplace limits tags by characters only, but buyers rarely type more
 * words than this, so tags, and the title phrases research counts, have at most four.
 */
export const MAX_TAG_WORDS = 4;

/** Whether `text` holds only the allowed characters. */
function onlyAllowed(text: string, allowed: AllowedCharacters): boolean {
  return new RegExp(`^[${allowed.pattern}]+$`, 'u').test(text);
}

/** `text` without the characters it may not hold. */
export function withoutRefused(text: string, allowed: AllowedCharacters): string {
  return text.replace(new RegExp(`[^${allowed.pattern}]`, 'gu'), '');
}

export interface Translation {
  readonly language: string;
  readonly text: ListingText;
}

export interface ListingText {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
}

/** Trims the text, drops repeated tags and checks it against the marketplace's rules. */
export function normalizeListingText(text: ListingText, rules: ListingTextRules): ListingText {
  const title = text.title.trim().replace(/\s+/g, ' ');
  const description = text.description.trim();
  const tags = uniqueTags(text.tags);
  checkTitle(title, rules);
  if (!description) throw new ValidationError('description', 'is empty');
  if (characterCount(description) > rules.descriptionLength) {
    throw new ValidationError(
      'description',
      `is longer than ${rules.descriptionLength} characters`,
    );
  }
  if (tags.length > rules.tags) {
    throw new ValidationError('tags', `has more than ${rules.tags} tags`);
  }
  for (const tag of tags) {
    if (characterCount(tag) > rules.tagLength) {
      throw new ValidationError('tags', `"${tag}" is longer than ${rules.tagLength} characters`);
    }
    if (!onlyAllowed(tag, rules.tagCharacters)) {
      throw new ValidationError('tags', `"${tag}" may only use ${rules.tagCharacters.words}`);
    }
  }
  return { title, description, tags };
}

function checkTitle(title: string, rules: ListingTextRules): void {
  if (!title) throw new ValidationError('title', 'is empty');
  if (characterCount(title) > rules.titleLength) {
    throw new ValidationError('title', `is longer than ${rules.titleLength} characters`);
  }
  if (!onlyAllowed(title, rules.titleCharacters)) {
    throw new ValidationError('title', `may only use ${rules.titleCharacters.words}`);
  }
  if (title.split(' ').filter(isCapitalWord).length > rules.capitalWords) {
    throw new ValidationError('title', `has more than ${rules.capitalWords} words in capitals`);
  }
  for (const character of rules.onceInTitle) {
    if (title.split(character).length > 2) {
      throw new ValidationError('title', `uses "${character}" more than once`);
    }
  }
}

/** A word in capitals, of which the marketplace allows only a few in a title. */
export function isCapitalWord(word: string): boolean {
  return /^\p{Lu}{2,}$/u.test(word);
}

/**
 * Tags with spaces tidied, without blanks or repeats in another case or with
 * other accents, e.g. `İstanbul` and `istanbul`. A repeat keeps the place of
 * the first, and the spelling with the most accents.
 */
export function uniqueTags(tags: readonly string[]): string[] {
  const at = new Map<string, number>();
  const unique: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = foldLetters(tag);
    const earlier = at.get(key);
    if (earlier === undefined) {
      at.set(key, unique.length);
      unique.push(tag);
    } else if (accents(tag) > accents(unique[earlier] ?? '')) {
      unique[earlier] = tag;
    }
  }
  return unique;
}

/** Letters outside plain ASCII, such as `İ`, `ß` or `é`. */
function accents(tag: string): number {
  return tag.match(/[^\p{ASCII}]/gu)?.length ?? 0;
}
