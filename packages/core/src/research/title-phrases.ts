import { MAX_TAG_WORDS } from '../listing/listing-text.js';
import type { MarketListing } from './market.js';
import { isMeasure, type TitleWords } from './title-words.js';

/**
 * Lower-case words, split at anything that is not a letter, number, apostrophe
 * or a hyphen inside a word (`mid-century`), with possessives written without
 * an apostrophe (`mother's` as `mothers`) and `tshirt` or `t shirt` as `t-shirt`.
 */
function wordsOf(text: string): string[][] {
  // Commas, bars and dashes between words separate the parts of a title.
  return text
    .toLowerCase()
    .replace(/[‘’]/gu, "'")
    .replace(/(\p{L})'s(?!\p{L})/gu, '$1s')
    .replace(/(?<![\p{L}\p{N}])t[\s-]?shirt/gu, 't-shirt')
    .split(/[,|/•·–—(){}[\]]+|\s-\s/u)
    .map((part) =>
      part
        .split(/[^\p{L}\p{N}'-]+/u)
        .map((word) => word.replace(/^-+|-+$/gu, ''))
        .filter(Boolean),
    );
}

/** Whether a longer phrase holds the term as whole words. */
export function holds(phrase: string, term: string): boolean {
  return phrase !== term && ` ${phrase} `.includes(` ${term} `);
}

/** Writes a title part's words the way the titles of one search mostly write them. */
export type Spelling = (words: readonly string[]) => string[];

/** Whether `words` holds `run` from `start` on. */
const runsAt = (words: readonly string[], run: readonly string[], start: number) =>
  run.every((word, index) => words[start + index] === word);

/**
 * How the listings' titles write each word joined by hyphens: as one word,
 * `mid-century`, or as its parts, `mid century`, whichever more titles use,
 * the joined word on a tie. The search then counts both as one phrase.
 */
export function spellingOf(listings: readonly MarketListing[]): Spelling {
  const titles = listings.map(({ title }) => wordsOf(title));
  const joined = new Set(titles.flat(2).filter((word) => word.includes('-')));
  const writing = (run: readonly string[]) =>
    titles.filter((parts) =>
      parts.some((part) => part.some((_, start) => runsAt(part, run, start))),
    ).length;
  const split = new Set([...joined].filter((word) => writing(word.split('-')) > writing([word])));
  const joins = [...joined].filter((word) => !split.has(word)).map((word) => word.split('-'));
  return (words) => {
    const spelled: string[] = [];
    for (let index = 0; index < words.length; index++) {
      const word = words[index] ?? '';
      const parts = joins.find((run) => runsAt(words, run, index));
      if (parts) {
        spelled.push(parts.join('-'));
        index += parts.length - 1;
      } else {
        spelled.push(...(split.has(word) ? word.split('-') : [word]));
      }
    }
    return spelled;
  };
}

/** A text in the words phrases are counted in, e.g. `Mother's Day  Mug` as `mothers day mug`. */
export function asPhrase(text: string, spell: Spelling): string {
  return spell(wordsOf(text).flat()).join(' ');
}

/** Each listing's title as the parts between its commas and bars, in counted words. */
export function titlePartsOf(
  listings: readonly MarketListing[],
  spell: Spelling,
): Map<string, string[]> {
  return new Map(
    listings.map(({ listingId, title }) => [
      listingId,
      wordsOf(title).map((part) => spell(part).join(' ')),
    ]),
  );
}

/** The words title parts write right before, or right after, the term. */
function wordsBeside(
  term: string,
  parts: readonly string[],
  side: 'before' | 'after',
): Set<string> {
  const run = term.split(' ');
  const found = new Set<string>();
  for (const part of parts) {
    const words = part.split(' ');
    words.forEach((_, start) => {
      if (!runsAt(words, run, start)) return;
      const beside = side === 'before' ? words[start - 1] : words[start + run.length];
      if (beside !== undefined && !isMeasure(beside)) found.add(beside);
    });
  }
  return found;
}

/**
 * Whether every title holding the term writes the same word right before, or
 * right after, it: the term is then a cut of a longer run, as `lover gift for
 * her` of `dog lover gift for her`. Each title is given as its parts.
 */
export function alwaysBeside(
  term: string,
  titles: readonly (readonly string[])[],
  side: 'before' | 'after',
): boolean {
  const [first = new Set<string>(), ...others] = titles.map((parts) =>
    wordsBeside(term, parts, side),
  );
  return [...first].some((word) => others.every((beside) => beside.has(word)));
}

function isPhrase(phrase: readonly string[], rules: TitleWords): boolean {
  const first = phrase[0] ?? '';
  const last = phrase[phrase.length - 1] ?? '';
  if (rules.stopWords.has(first) || rules.stopWords.has(last) || rules.pronouns.has(first)) {
    return false;
  }
  if (rules.pronouns.has(last) && phrase[phrase.length - 2] !== rules.forWord) return false;
  if (phrase.some(isMeasure)) return false;
  // A number says something only with words around it, as in `class of 2026`.
  if (phrase.length === 1) return first.length >= 3 && !/^\p{N}+$/u.test(first);
  return true;
}

/** The phrases of one to four words a title holds. */
function phrasesOf(title: string, rules: TitleWords, spell: Spelling): Set<string> {
  const phrases = new Set<string>();
  for (const words of wordsOf(title).map(spell)) {
    for (let size = 1; size <= MAX_TAG_WORDS; size++) {
      for (let start = 0; start + size <= words.length; start++) {
        const phrase = words.slice(start, start + size);
        if (isPhrase(phrase, rules)) phrases.add(phrase.join(' '));
      }
    }
  }
  return phrases;
}

/** Who uses a phrase: listing ids of results and ads, and the shops of each. */
export interface Usage {
  readonly results: ReadonlySet<string>;
  readonly shops: ReadonlySet<string>;
  readonly ads: ReadonlySet<string>;
  readonly adShops: ReadonlySet<string>;
}

export const UNUSED: Usage = {
  results: new Set(),
  shops: new Set(),
  ads: new Set(),
  adShops: new Set(),
};

/** A listing whose shop could not be read counts as a shop of its own. */
function shopOf(listing: MarketListing): string {
  return listing.shopName.toLowerCase() || `#${listing.listingId}`;
}

function countUsage(
  listings: readonly MarketListing[],
  rules: TitleWords,
  spell: Spelling,
): Map<string, Usage> {
  type Counted = { [Key in keyof Usage]: Set<string> };
  const used = new Map<string, Counted>();
  for (const listing of listings) {
    for (const phrase of phrasesOf(listing.title, rules, spell)) {
      const usage: Counted = used.get(phrase) ?? {
        results: new Set(),
        shops: new Set(),
        ads: new Set(),
        adShops: new Set(),
      };
      used.set(phrase, usage);
      if (listing.isAd) {
        usage.ads.add(listing.listingId);
        usage.adShops.add(shopOf(listing));
      } else {
        usage.results.add(listing.listingId);
        usage.shops.add(shopOf(listing));
      }
    }
  }
  return used;
}

/** The phrase with its last word in the singular, when titles use that form too. */
function singularIn(
  phrases: ReadonlyMap<string, Usage>,
  phrase: string,
  rules: TitleWords,
): string | undefined {
  const cut = phrase.lastIndexOf(' ') + 1;
  const word = phrase.slice(cut);
  for (const [ending, singular] of rules.plurals) {
    if (!word.endsWith(ending) || word.length - ending.length < 3) continue;
    const candidate = phrase.slice(0, cut) + word.slice(0, -ending.length) + singular;
    if (candidate !== phrase && phrases.has(candidate)) return candidate;
  }
  return undefined;
}

const union = (a: ReadonlySet<string>, b: ReadonlySet<string>) => new Set([...a, ...b]);

/** Counts a plural and its singular as one phrase, shown in the form more titles use. */
function foldPlurals(used: ReadonlyMap<string, Usage>, rules: TitleWords): Map<string, Usage> {
  const folded = new Map(used);
  for (const phrase of used.keys()) {
    const plural = folded.get(phrase);
    const singular = plural && singularIn(folded, phrase, rules);
    const other = singular === undefined ? undefined : folded.get(singular);
    if (!plural || singular === undefined || !other) continue;
    folded.delete(phrase);
    folded.delete(singular);
    folded.set(plural.results.size > other.results.size ? phrase : singular, {
      results: union(plural.results, other.results),
      shops: union(plural.shops, other.shops),
      ads: union(plural.ads, other.ads),
      adShops: union(plural.adShops, other.adShops),
    });
  }
  return folded;
}

/**
 * Every phrase the listings' titles use, in the rules of their language and
 * the titles' `spell`ing, with who uses it; a plural and its singular count as one.
 */
export function titlePhrases(
  listings: readonly MarketListing[],
  rules: TitleWords,
  spell: Spelling,
): Map<string, Usage> {
  return foldPlurals(countUsage(listings, rules, spell), rules);
}
