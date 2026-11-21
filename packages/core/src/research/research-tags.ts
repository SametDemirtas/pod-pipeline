import { characterCount, type ListingTextRules } from '@pod/rules';
import { MAX_TAG_WORDS } from '../listing/listing-text.js';
import type { KeywordReport, KeywordTerm } from './keyword-report.js';
import { alwaysBeside, holds, spellingOf, titlePartsOf } from './title-phrases.js';
import { wordsOf } from './phrase-words.js';
import { titleWordsFor } from './title-words.js';

const lastWord = (term: string) => wordsOf(term).at(-1);

/** What decides which phrases make tags and how many a listing takes. */
export type TagRules = Pick<ListingTextRules, 'tags' | 'tagLength'>;

/** A phrase short enough to be one of the marketplace's tags. */
export function couldBeTag(term: string, rules: TagRules): boolean {
  return wordsOf(term).length <= MAX_TAG_WORDS && characterCount(term) <= rules.tagLength;
}

/**
 * A tag worth a slot: a phrase that fits, or, in a language that writes
 * compounds, one long compound. A single plain word, such as `personalized`
 * or `poster`, matches too many searches to bring buyers.
 */
function isGoodTag(term: string, language: string, rules: TagRules): boolean {
  if (!couldBeTag(term, rules)) return false;
  return wordsOf(term).length > 1 || (titleWordsFor(language).compound?.test(term) ?? false);
}

/** Whether the piece starts inside the phrase and carries on past its end. */
function runsPast(phrase: string, piece: string): boolean {
  const [words, more] = [wordsOf(phrase), wordsOf(piece)];
  return more.some(
    (_, size) => size > 0 && words.slice(-size).every((word, index) => word === more[index]),
  );
}

/**
 * Whether every result writes a phrase of the most words counted with the
 * same word after it, as `mid century modern wall` before `art`: the phrase
 * is then cut short of its noun.
 */
function cutShort(report: KeywordReport): (phrase: string) => boolean {
  const titleParts = titlePartsOf(report.listings, spellingOf(report.listings));
  const results = report.listings
    .filter((listing) => !listing.isAd)
    .map((listing) => titleParts.get(listing.listingId) ?? []);
  return (phrase) =>
    wordsOf(phrase).length === MAX_TAG_WORDS &&
    alwaysBeside(
      phrase,
      results.filter((parts) => parts.some((part) => ` ${part} `.includes(` ${phrase} `))),
      'after',
    );
}

/**
 * Of the pieces of one longer title phrase that Etsy does not suggest, the one
 * most results use, then the one sharing more words with the query. Only a
 * piece ending where the phrase's noun ends counts: `gift for dog` of
 * `gift for dog mom` leaves out who the gift is for, and of `mid century
 * modern wall`, always followed by `art`, `modern wall art` ends there but
 * `century modern wall` does not. When that piece is a term of its own, as
 * `fishing shirt` of `vintage fishing shirt`, the best other piece meeting it
 * at one word stands in, here `vintage fishing`.
 */
function bestPieces(report: KeywordReport): Set<KeywordTerm> {
  const queryWords = new Set(wordsOf(report.queryTerm.term));
  const sharedWithQuery = (term: KeywordTerm) =>
    wordsOf(term.term).filter((word) => queryWords.has(word)).length;
  const stronger = (a: KeywordTerm, b: KeywordTerm) =>
    a.listings - b.listings || sharedWithQuery(a) - sharedWithQuery(b);
  const isCutShort = cutShort(report);
  const endsWithNoun = (piece: string, phrase: string) =>
    runsPast(phrase, piece) || (lastWord(piece) === lastWord(phrase) && !isCutShort(phrase));
  const nounTerm = (phrase: string) =>
    [report.queryTerm, ...report.terms].find(
      (term) =>
        term.partOfLonger === null &&
        holds(phrase, term.term) &&
        lastWord(term.term) === lastWord(phrase),
    );
  // A stand-in repeating more than the word where it meets the noun adds little.
  const addsTo = (noun: KeywordTerm) => (piece: KeywordTerm) =>
    wordsOf(piece.term).filter((word) => wordsOf(noun.term).includes(word)).length <= 1;
  const pieces = new Map<string, { nouns: KeywordTerm[]; others: KeywordTerm[] }>();
  for (const term of report.terms) {
    const phrase = term.partOfLonger;
    if (phrase === null || term.suggested) continue;
    const found = pieces.get(phrase) ?? { nouns: [], others: [] };
    pieces.set(phrase, found);
    (endsWithNoun(term.term, phrase) ? found.nouns : found.others).push(term);
  }
  const strongest = (terms: readonly KeywordTerm[]) =>
    terms.reduce<KeywordTerm | undefined>(
      (best, term) => (best === undefined || stronger(term, best) > 0 ? term : best),
      undefined,
    );
  return new Set(
    [...pieces].flatMap(([phrase, { nouns, others }]) => {
      const noun = nounTerm(phrase);
      const best = strongest(nouns) ?? (noun && strongest(others.filter(addsTo(noun))));
      return best ? [best] : [];
    }),
  );
}

/** The same words in any order, e.g. `cat mug` and `mug cat`. */
const wordSet = (term: string) => [...new Set(wordsOf(term))].sort().join(' ');

/**
 * The query first, as it was searched, then phrases Etsy suggests, then the
 * other phrases, then the best piece of each longer title phrase, then
 * phrases only ads use, single words last, otherwise in the report's order.
 * A term with the same words as an earlier one is left out; long tails that
 * share words are kept.
 * Trademarks are left out.
 */
function strongestTerms(report: KeywordReport): KeywordTerm[] {
  const searched =
    report.terms.find((term) => term.term === report.queryTerm.term) ?? report.queryTerm;
  const pieces = bestPieces(report);
  const rank = (term: KeywordTerm) => {
    if (term === searched) return 0;
    if (wordsOf(term.term).length === 1) return 5;
    if (term.suggested) return 1;
    if (term.adOnly) return 4;
    return term.partOfLonger === null ? 2 : 3;
  };
  const seen = new Set<string>();
  return [searched, ...report.terms.filter((term) => term !== searched)]
    .filter((term) => !term.trademark)
    .filter(
      (term) =>
        term === searched || term.partOfLonger === null || term.suggested || pieces.has(term),
    )
    .map((term, index) => ({ term, index }))
    .sort((a, b) => rank(a.term) - rank(b.term) || a.index - b.index)
    .map(({ term }) => term)
    .filter((term) => {
      const words = wordSet(term.term);
      return !seen.has(words) && Boolean(seen.add(words));
    });
}

/**
 * Up to as many tags as a listing takes from the report's strongest terms in
 * the market's `language`. A compound already held by a picked tag is left out. Fewer
 * tags come back when the search has no more good ones.
 */
export function suggestedTags(report: KeywordReport, language: string, rules: TagRules): string[] {
  const tags: string[] = [];
  const tagged = new Set<string>();
  for (const { term } of strongestTerms(report)) {
    if (tags.length === rules.tags) break;
    if (!isGoodTag(term, language, rules)) continue;
    const words = wordsOf(term);
    if (words.length === 1 && tagged.has(term)) continue;
    tags.push(term);
    for (const word of words) tagged.add(word);
  }
  return tags;
}

/** A term for whoever writes the listing, with what the search found about it. */
export interface WriterWord {
  readonly term: string;
  readonly suggested: boolean;
  /** Shops on the first page using it; 0 for a query no result used. */
  readonly shops: number;
}

/** The report's strongest terms for the writer, the query first. */
export function writerWords(report: KeywordReport): WriterWord[] {
  return strongestTerms(report).map(({ term, suggested, shops }) => ({ term, suggested, shops }));
}
