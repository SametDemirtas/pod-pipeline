import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { RESEARCH_SAMPLES, type ResearchSample } from '@pod/contracts/testing';
import {
  keywordReport,
  MARKETS,
  type MarketSearchPage,
  type ResearchRun,
  type ResearchRunId,
} from '@pod/core';
import { toResearchRunDto } from '../dto/research-dtos.js';

function pageOf(sample: ResearchSample): MarketSearchPage {
  return {
    query: sample.query,
    resultsLabel: null,
    listings: sample.titles.map(({ title, shop, isAd = false }, index) => ({
      listingId: String(index + 1),
      title,
      shopName: shop,
      price: 20,
      currency: MARKETS[sample.market].currency,
      onSale: false,
      freeShipping: false,
      isAd,
      isTopSeller: false,
      badges: [],
    })),
    suggestions: sample.suggestions,
    suggestionsAvailable: true,
    warnings: [],
  };
}

function reportOf(sample: ResearchSample) {
  const run: ResearchRun = {
    id: 'sample' as ResearchRunId,
    query: sample.query,
    market: sample.market,
    createdAt: new Date(0),
    report: keywordReport(pageOf(sample), MARKETS[sample.market], LISTING_RULES),
  };
  return toResearchRunDto(run, LISTING_RULES).report;
}

// The window's tests read these reports, so they must be what the app makes.
// `npm run test:research-samples` writes them again after the counting or the tag picking changed.
describe('research samples', () => {
  it('are counted, and their tags picked, as the stored reports say', async () => {
    const reports = Object.fromEntries(
      Object.entries(RESEARCH_SAMPLES).map(([name, sample]) => [name, reportOf(sample)]),
    );

    await expect(`${JSON.stringify(reports, null, 2)}\n`).toMatchFileSnapshot(
      '../../../../../../packages/contracts/src/testing/research-reports.json',
    );
  });
});
