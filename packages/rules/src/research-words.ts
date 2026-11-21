import type { ResearchRunDto, SearchWordRequest } from '@pod/contracts/client';

/** The run's words for writing a listing, the query first; a query no result used has no count. */
export function searchWordsOfRun({ market, report }: ResearchRunDto): SearchWordRequest[] {
  return report.writerWords.map(({ term, suggested, shops }) => ({
    term,
    market,
    suggested,
    ...(shops === 0 ? {} : { shops }),
  }));
}
