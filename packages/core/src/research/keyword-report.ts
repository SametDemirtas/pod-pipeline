import { findTrademarks } from '../listing/trademarks.js';
import { compareCodeUnits } from '../ordering.js';
import { joinedRuns, keptForAds, keptPhrases, type TitleParts } from './kept-phrases.js';
import { isSubsetOf, wordCount } from './phrase-words.js';
import type { Market, MarketListing, MarketSearchPage, ReadWarning } from './market.js';
import {
  currencyWarnings,
  listingShares,
  priceSummary,
  shareOf,
  type ListingShares,
  type PriceSummary,
} from './price-summary.js';
import { couldBeTag, type TagRules } from './research-tags.js';
import {
  asPhrase,
  holds,
  spellingOf,
  titlePartsOf,
  titlePhrases,
  UNUSED,
  type Spelling,
  type Usage,
} from './title-phrases.js';
import { titleWordsFor } from './title-words.js';

export type { ListingShares, PriceSummary } from './price-summary.js';

/** A word or phrase from competitors' titles. */
export interface KeywordTerm {
  readonly term: string;
  /** How many organic results use it in their title. */
  readonly listings: number;
  /** How many shops those results come from; one shop repeating a phrase says little. */
  readonly shops: number;
  /** How many ads use it, counted apart from the results. */
  readonly ads: number;
  /** Share of the organic results that use it, from 0 to 1. */
  readonly share: number;
  /** Whether Etsy suggests it as a search, a sign buyers type it. */
  readonly suggested: boolean;
  /** It names a trademark, so it must not end up in a listing. */
  readonly trademark: boolean;
  /**
   * For a tag-sized piece of a longer title phrase that all its results use,
   * that phrase, e.g. `best cat dad ever` for `cat dad ever`; the piece says
   * little on its own. `null` for a phrase with support of its own.
   */
  readonly partOfLonger: string | null;
  /**
   * Kept only because ads of two shops or more use it, in a search with few
   * results; no organic share speaks for it.
   */
  readonly adOnly: boolean;
}

/** What a search tells about demand and competition, counted from what Etsy showed. */
export interface KeywordReport extends ListingShares {
  readonly query: string;
  readonly resultsLabel: string | null;
  readonly listingCount: number;
  /** Listings that are results rather than ads. */
  readonly organicCount: number;
  readonly prices: PriceSummary | null;
  /** The query as one term, in the words terms are counted in, e.g. `mothers day mug`. */
  readonly queryTerm: KeywordTerm;
  readonly suggestions: readonly string[];
  readonly suggestionsAvailable: boolean;
  readonly warnings: readonly ReadWarning[];
  /** Used by most shops first. */
  readonly terms: readonly KeywordTerm[];
  readonly listings: readonly MarketListing[];
}

export const MAX_TERMS = 40;

/**
 * Etsy's suggestions all contain the query, so a single word or a term made
 * only of the query's words counts as searched when a suggestion is exactly
 * it, and any other phrase when a suggestion contains it.
 */
function suggestedIn(page: MarketSearchPage, spell: Spelling): (term: string) => boolean {
  const queryWords = new Set(asPhrase(page.query, spell).split(' '));
  const suggestions = page.suggestions.map((suggestion) => asPhrase(suggestion, spell));
  return (term) => {
    const words = term.split(' ');
    return (
      suggestions.includes(term) ||
      (words.length > 1 &&
        words.some((word) => !queryWords.has(word)) &&
        suggestions.some((suggestion) => holds(suggestion, term)))
    );
  };
}

/** What the terms of one search are counted against. */
interface Counting {
  readonly organicCount: number;
  readonly titleParts: TitleParts;
  readonly isSuggested: (term: string) => boolean;
  readonly rules: TagRules;
  /** Kept phrases too long to be tags, those most results use first. */
  readonly longTitlePhrases: readonly (readonly [string, Usage])[];
}

/** Whether each of the results writes the two phrases as one run, so they are one phrase there. */
function runsOnIn(
  results: ReadonlySet<string>,
  longer: string,
  term: string,
  titleParts: TitleParts,
): boolean {
  return joinedRuns(longer, term).some((run) =>
    [...results].every((id) =>
      titleParts.get(id)?.some((part) => ` ${part} `.includes(` ${run} `)),
    ),
  );
}

function longerPhraseOf(term: string, usage: Usage, counting: Counting): string | null {
  if (usage.results.size === 0 || !couldBeTag(term, counting.rules)) return null;
  const longer = counting.longTitlePhrases.find(
    ([phrase, more]) =>
      isSubsetOf(usage.results, more.results) &&
      (holds(phrase, term) || runsOnIn(usage.results, phrase, term, counting.titleParts)),
  );
  return longer?.[0] ?? null;
}

function toTerm(counting: Counting, term: string, usage: Usage = UNUSED): KeywordTerm {
  return {
    term,
    listings: usage.results.size,
    shops: usage.shops.size,
    ads: usage.ads.size,
    share: shareOf(usage.results.size, counting.organicCount),
    suggested: counting.isSuggested(term),
    trademark: findTrademarks(term).length > 0,
    partOfLonger: longerPhraseOf(term, usage, counting),
    adOnly: keptForAds(term, usage, counting.organicCount),
  };
}

/** More shops first, then longer phrases, as they make better tags. */
function byRank(a: KeywordTerm, b: KeywordTerm): number {
  return (
    b.shops - a.shops ||
    wordCount(b.term) - wordCount(a.term) ||
    b.listings - a.listings ||
    compareCodeUnits(a.term, b.term)
  );
}

/**
 * Counts which words and phrases the organic results use in their titles, in
 * the rules of the market's language. A phrase is kept when at least two
 * shops use it, or, in a search with few results, the ads of two shops, unless
 * longer phrases say all it does or it is a shop's name. A word joined by
 * hyphens counts the same written with spaces.
 * Phrases more shops use come first, longer ones first among equals, since
 * they make better tags.
 */
export function keywordReport(
  page: MarketSearchPage,
  market: Market,
  rules: TagRules,
): KeywordReport {
  const { listings } = page;
  const prices = priceSummary(listings);
  const organicCount = listings.filter((listing) => !listing.isAd).length;
  const spell = spellingOf(listings);
  const phrases = titlePhrases(listings, titleWordsFor(market.language), spell);
  const titleParts: TitleParts = titlePartsOf(listings, spell);
  const kept = keptPhrases(listings, phrases, titleParts, organicCount, rules);
  const counting: Counting = {
    organicCount,
    titleParts,
    isSuggested: suggestedIn(page, spell),
    rules,
    longTitlePhrases: kept
      .filter(([term]) => !couldBeTag(term, rules))
      .sort(([, a], [, b]) => b.results.size - a.results.size),
  };
  const query = asPhrase(page.query, spell);
  return {
    query: page.query,
    resultsLabel: page.resultsLabel,
    listingCount: listings.length,
    organicCount,
    prices,
    ...listingShares(listings),
    queryTerm: toTerm(counting, query, phrases.get(query)),
    suggestions: page.suggestions,
    suggestionsAvailable: page.suggestionsAvailable,
    warnings: [...page.warnings, ...currencyWarnings(prices, market)],
    terms: kept
      .map(([term, usage]) => toTerm(counting, term, usage))
      .sort(byRank)
      .slice(0, MAX_TERMS),
    listings,
  };
}
