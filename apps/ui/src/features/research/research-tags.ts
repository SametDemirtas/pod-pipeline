import type { KeywordListDto, SearchWordRequest } from '@pod/contracts/client';

/**
 * The list's keywords for the listing writer, most searched first where the file gives
 * searches, with its market. A keyword holding commas is several search words,
 * which share no figure.
 */
export function searchWordsFromList(list: KeywordListDto): SearchWordRequest[] {
  return list.keywords
    .filter((keyword) => !keyword.trademark)
    .map((keyword, index) => ({ keyword, index }))
    .sort((a, b) => (b.keyword.searches ?? -1) - (a.keyword.searches ?? -1) || a.index - b.index)
    .flatMap(({ keyword: { term, searches } }) => {
      const parts = term
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      return parts.length === 1 && searches !== null
        ? [{ term, market: list.market, searches }]
        : parts.map((part) => ({ term: part, market: list.market }));
    });
}
