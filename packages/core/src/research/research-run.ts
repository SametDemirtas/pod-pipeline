import type { KeywordReport } from './keyword-report.js';
import type { MarketRegion } from './market.js';

export type ResearchRunId = string & { readonly __brand: 'ResearchRunId' };

/** One market search the seller ran, kept to reuse its words. */
export interface ResearchRun {
  readonly id: ResearchRunId;
  readonly query: string;
  readonly market: MarketRegion;
  readonly createdAt: Date;
  readonly report: KeywordReport;
}
