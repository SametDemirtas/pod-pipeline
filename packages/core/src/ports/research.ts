import type { ResearchRun, ResearchRunId } from '../research/research-run.js';

export interface ResearchRepository {
  save(run: ResearchRun): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<readonly ResearchRun[]>;
  get(id: ResearchRunId): Promise<ResearchRun | undefined>;
  /** Removes all but the newest runs. */
  keepNewest(count: number): Promise<void>;
}
