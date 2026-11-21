import { SqliteResearchRepository } from '@pod/adapter-sqlite';
import { ResearchKeywords } from '@pod/core';
import { LISTING_RULES } from '@pod/rules';
import { ResearchService } from '../../application/research/research-service.js';
import { translateMarketSearch } from '../market-search-errors.js';
import type { SharedParts } from '../shared-parts.js';

/** Etsy keyword research in the hidden browser window, with the last runs kept. */
export function createResearchService(
  parts: Pick<SharedParts, 'database' | 'clock' | 'ids' | 'options'>,
): ResearchService {
  const runs = new SqliteResearchRepository(parts.database);
  return new ResearchService({
    research: new ResearchKeywords({
      search: translateMarketSearch(parts.options.marketSearch),
      runs,
      clock: parts.clock,
      ids: parts.ids,
      rules: LISTING_RULES,
    }),
    runs,
    clock: parts.clock,
    rules: LISTING_RULES,
  });
}
