import { MAX_TAG_WORDS } from '../listing/listing-text.js';
import type { MarketListing } from './market.js';
import { couldBeTag, type TagRules } from './research-tags.js';
import { alwaysBeside, holds, type Usage } from './title-phrases.js';
import { isSubsetOf, wordCount } from './phrase-words.js';

/** Below this many results, phrases that the ads of several shops share are shown too. */
const FEW_RESULTS = 10;

/**
 * The runs of words in which one phrase carries on into the other, as
 * `cat dad ever mug` for `cat dad ever` and `dad ever mug`.
 */
export function joinedRuns(a: string, b: string): string[] {
  const join = (left: string[], right: string[]) =>
    left.flatMap((_, start) => {
      const tail = left.slice(start);
      const runsOn =
        start > 0 &&
        tail.length < right.length &&
        tail.every((word, index) => word === right[index]);
      return runsOn ? [[...left.slice(0, start), ...right].join(' ')] : [];
    });
  const [x, y] = [a.split(' '), b.split(' ')];
  return [...join(x, y), ...join(y, x)];
}

/** Each listing's title as the parts between its commas and bars, in counted words. */
export type TitleParts = ReadonlyMap<string, readonly string[]>;

/**
 * Whether longer phrases say all the term does: every result using it also
 * uses a longer phrase holding it, and at least one of those is used by two
 * shops, so `day gift` goes for `fathers day gift` and `mothers day gift`
 * while `mug` stays when each mug is called something else. A phrase that
 * could be a tag only gives way to phrases that could be tags too, and one
 * that a result writes as a whole part of its title, as `gift for her` in
 * `Cat Mug, Gift for Her`, stands on its own.
 */
function saidLonger(
  term: string,
  usage: Usage,
  phrases: ReadonlyMap<string, Usage>,
  titleParts: TitleParts,
  rules: TagRules,
): boolean {
  // A phrase only ads use is judged by the ads.
  const organic = usage.results.size > 0;
  const usersOf = (some: Usage) => (organic ? some.results : some.ads);
  const shopsOf = (some: Usage) => (organic ? some.shops : some.adShops);
  if ([...usersOf(usage)].some((id) => titleParts.get(id)?.includes(term))) return false;
  const longer = [...phrases].filter(
    ([other]) => holds(other, term) && (!couldBeTag(term, rules) || couldBeTag(other, rules)),
  );
  const covered = new Set(longer.flatMap(([, more]) => [...usersOf(more)]));
  return isSubsetOf(usersOf(usage), covered) && longer.some(([, more]) => shopsOf(more).size >= 2);
}

/**
 * Whether a phrase of the most words counted is always the tail of the same
 * longer run, as `lover gift for her` of `dog lover gift for her`: every
 * result writes the same word before it. The run is too long to be counted
 * itself, and its tail lacks the words that say what it is about.
 */
function tailOfLongerRun(term: string, usage: Usage, titleParts: TitleParts): boolean {
  if (wordCount(term) < MAX_TAG_WORDS) return false;
  const titles = [...usage.results].map((id) => titleParts.get(id) ?? []);
  return alwaysBeside(term, titles, 'before');
}

const compact = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A phrase kept only because ads of two shops use it, in a search with few results. */
export function keptForAds(term: string, usage: Usage, organicCount: number): boolean {
  return (
    wordCount(term) > 1 &&
    usage.shops.size < 2 &&
    organicCount < FEW_RESULTS &&
    usage.adShops.size >= 2
  );
}

/**
 * The phrases used by two shops or more, or kept for the ads, that are no
 * shop's name and say something longer phrases do not.
 */
export function keptPhrases(
  listings: readonly MarketListing[],
  phrases: ReadonlyMap<string, Usage>,
  titleParts: TitleParts,
  organicCount: number,
  rules: TagRules,
): [string, Usage][] {
  const shopNames = new Set(listings.map((listing) => compact(listing.shopName)));
  return [...phrases].filter(
    ([term, usage]) =>
      (usage.shops.size >= 2 || keptForAds(term, usage, organicCount)) &&
      !shopNames.has(compact(term)) &&
      !tailOfLongerRun(term, usage, titleParts) &&
      !saidLonger(term, usage, phrases, titleParts, rules),
  );
}
