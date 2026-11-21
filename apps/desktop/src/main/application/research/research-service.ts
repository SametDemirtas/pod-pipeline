import {
  type CatalogApi,
  type ResearchIdRequest,
  type ResearchRequest,
  type ResearchRunDto,
  type ResearchSummaryDto,
} from '@pod/contracts';
import { RESEARCH_GAP_MS, RESEARCH_PER_HOUR, type ListingTextRules } from '@pod/rules';
import {
  NotFoundError,
  RESEARCH_HISTORY,
  researchQuery,
  type Clock,
  type ResearchKeywords,
  type ResearchRepository,
  type ResearchRunId,
} from '@pod/core';
import { ResearchInProgressError, ResearchRateLimitedError } from '../errors/research-errors.js';
import { toResearchRunDto, toResearchSummaryDto } from '../dto/research-dtos.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import { SearchPace } from './search-pace.js';

export type ResearchApi = Pick<CatalogApi, 'researchKeywords' | 'listResearch' | 'getResearch'>;

export interface ResearchServiceDeps {
  readonly research: Pick<ResearchKeywords, 'execute'>;
  readonly runs: Pick<ResearchRepository, 'get' | 'list'>;
  readonly clock: Clock;
  /** Which phrases make tags and how many a listing takes. */
  readonly rules: Pick<ListingTextRules, 'tags' | 'tagLength'>;
}

/** Market research for the seller and assistants: one Etsy search at a time. */
export class ResearchService implements ResearchApi {
  // One window searches at a time, so Etsy sees one buyer, not several at once.
  private readonly runner = new ExclusiveRunner(() => new ResearchInProgressError());

  // In memory only: a restart starts it afresh, and restarting takes longer than a person's pace.
  private readonly pace: SearchPace;

  constructor(private readonly deps: ResearchServiceDeps) {
    this.pace = new SearchPace({
      gapMs: RESEARCH_GAP_MS,
      perHour: RESEARCH_PER_HOUR,
      now: () => deps.clock.now().getTime(),
    });
  }

  researchKeywords(request: ResearchRequest): Promise<ResearchRunDto> {
    return this.runner.run(async () => {
      // A query the core would refuse does not use up a search.
      const query = researchQuery(request.query);
      const wait = this.pace.take();
      if (wait > 0) throw new ResearchRateLimitedError(wait);
      const run = await this.deps.research.execute(query, request.market);
      return toResearchRunDto(run, this.deps.rules);
    });
  }

  async listResearch(): Promise<readonly ResearchSummaryDto[]> {
    return (await this.deps.runs.list(RESEARCH_HISTORY)).map(toResearchSummaryDto);
  }

  async getResearch(request: ResearchIdRequest): Promise<ResearchRunDto> {
    const run = await this.deps.runs.get(request.id as ResearchRunId);
    if (!run) throw new NotFoundError('Research', request.id);
    return toResearchRunDto(run, this.deps.rules);
  }

  /** Refuses new searches and resolves once the one under way is stored. */
  close(): Promise<void> {
    return this.runner.close();
  }
}
