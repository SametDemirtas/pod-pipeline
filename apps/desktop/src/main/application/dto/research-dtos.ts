import type {
  KeywordListDto,
  KeywordListSummaryDto,
  ResearchRunDto,
  ResearchSummaryDto,
} from '@pod/contracts';
import {
  MARKETS,
  suggestedTags,
  writerWords,
  type KeywordList,
  type KeywordListSummary,
  type ResearchRun,
} from '@pod/core';
import { isMarketBadge, type ListingTextRules } from '@pod/rules';

/** The run as the window shows it, with tags of the size the marketplace takes. */
export function toResearchRunDto(
  run: ResearchRun,
  rules: Pick<ListingTextRules, 'tags' | 'tagLength'>,
): ResearchRunDto {
  return {
    id: run.id,
    query: run.query,
    market: run.market,
    createdAt: run.createdAt.toISOString(),
    report: {
      ...run.report,
      listings: run.report.listings.map((listing) => ({
        ...listing,
        badges: listing.badges.filter(isMarketBadge),
      })),
      suggestedTags: suggestedTags(run.report, MARKETS[run.market].language, rules),
      writerWords: writerWords(run.report),
    },
  };
}

export function toResearchSummaryDto(run: ResearchRun): ResearchSummaryDto {
  return {
    id: run.id,
    query: run.query,
    market: run.market,
    createdAt: run.createdAt.toISOString(),
    resultsLabel: run.report.resultsLabel,
    topTerms: run.report.terms.slice(0, 5).map((term) => term.term),
  };
}

export function toKeywordListDto(list: KeywordList): KeywordListDto {
  return { ...list, importedAt: list.importedAt.toISOString() };
}

export function toKeywordListSummaryDto(list: KeywordListSummary): KeywordListSummaryDto {
  return { ...list, importedAt: list.importedAt.toISOString() };
}
