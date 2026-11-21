import type {
  KeywordEntryDto,
  KeywordListDto,
  KeywordListSummaryDto,
  ResearchMarket,
  SearchWordRequest,
} from '@pod/contracts/client';

/** Imported lists of the market a design takes words from, the newest first. */
const LISTS_PER_DESIGN = 3;
/** Shorter words of a concept name, such as `of`, would match nearly every keyword. */
const MIN_CONCEPT_WORD_LENGTH = 3;

/** What a design is called, to find the imported keywords that fit it. */
export interface DesignWords {
  /** The product type, such as `blanket`. */
  readonly product: string;
  readonly conceptName: string | null;
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The same word, or one of them its plural with an `s`. */
function sameWord(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s`;
}

/** The lists to read for a market: the newest ones exported for it. */
export function listsForMarket(
  lists: readonly KeywordListSummaryDto[],
  market: ResearchMarket,
): KeywordListSummaryDto[] {
  return [...lists]
    .filter((list) => list.market === market)
    .sort((a, b) => Date.parse(b.importedAt) - Date.parse(a.importedAt))
    .slice(0, LISTS_PER_DESIGN);
}

function fitsDesign({ product, conceptName }: DesignWords): (entry: KeywordEntryDto) => boolean {
  const productWords = wordsOf(product);
  const conceptWords = wordsOf(conceptName ?? '').filter(
    (word) =>
      word.length >= MIN_CONCEPT_WORD_LENGTH && !productWords.some((own) => sameWord(own, word)),
  );
  return (entry) => {
    const words = wordsOf(entry.term);
    const has = (word: string) => words.some((term) => sameWord(term, word));
    return (productWords.length > 0 && productWords.every(has)) || conceptWords.some(has);
  };
}

/**
 * Keywords of the imported lists that name the design's product or a word of
 * its concept, most searched first and trademarks left out, at most `limit`.
 */
export function listWordsFor(
  lists: readonly KeywordListDto[],
  design: DesignWords,
  limit: number,
): SearchWordRequest[] {
  const fits = fitsDesign(design);
  const found = new Map<string, SearchWordRequest>();
  for (const list of lists) {
    for (const entry of list.keywords) {
      const key = entry.term.toLowerCase().trim();
      if (entry.trademark || !key || !fits(entry)) continue;
      const known = found.get(key);
      if (known && (known.searches ?? -1) >= (entry.searches ?? -1)) continue;
      found.set(key, {
        term: entry.term.trim(),
        market: list.market,
        ...(entry.searches === null ? {} : { searches: entry.searches }),
      });
    }
  }
  return [...found.values()]
    .sort((a, b) => (b.searches ?? -1) - (a.searches ?? -1))
    .slice(0, limit);
}
