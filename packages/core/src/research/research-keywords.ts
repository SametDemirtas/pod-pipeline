import { ValidationError } from '../errors.js';
import type { MarketSearch } from '../ports/market-search.js';
import type { ResearchRepository } from '../ports/research.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import { keywordReport } from './keyword-report.js';
import type { TagRules } from './research-tags.js';
import { DEFAULT_MARKET, MARKETS, type MarketRegion } from './market.js';
import type { ResearchRun, ResearchRunId } from './research-run.js';
import { characterCount } from '@pod/rules';

export const MAX_QUERY_LENGTH = 100;
/** Older searches are dropped; Etsy's results change, so they go stale anyway. */
export const RESEARCH_HISTORY = 20;

/** The query with its spaces tidied; refuses one that is empty or too long. */
export function researchQuery(raw: string): string {
  const query = raw.trim().replace(/\s+/g, ' ');
  if (!query) throw new ValidationError('query', 'is empty');
  if (characterCount(query) > MAX_QUERY_LENGTH) {
    throw new ValidationError('query', `is longer than ${MAX_QUERY_LENGTH} characters`);
  }
  return query;
}

export interface ResearchKeywordsDeps {
  readonly search: MarketSearch;
  readonly runs: Pick<ResearchRepository, 'save' | 'keepNewest'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Which phrases the report counts as tags. */
  readonly rules: TagRules;
}

/** Searches Etsy like a buyer in the market, counts what the results say, and keeps the report. */
export class ResearchKeywords {
  constructor(private readonly deps: ResearchKeywordsDeps) {}

  async execute(rawQuery: string, region: MarketRegion = DEFAULT_MARKET): Promise<ResearchRun> {
    const query = researchQuery(rawQuery);
    const market = MARKETS[region];
    const page = await this.deps.search.search(query, market);
    const run: ResearchRun = {
      id: this.deps.ids.next() as ResearchRunId,
      query,
      market: region,
      createdAt: this.deps.clock.now(),
      report: keywordReport(page, market, this.deps.rules),
    };
    await this.deps.runs.save(run);
    await this.deps.runs.keepNewest(RESEARCH_HISTORY);
    return run;
  }
}
