import type { KeywordList, KeywordListId, KeywordListSummary } from '../research/keyword-list.js';

export interface KeywordListRepository {
  save(list: KeywordList): Promise<void>;
  /** Newest first. */
  list(): Promise<readonly KeywordListSummary[]>;
  get(id: KeywordListId): Promise<KeywordList | undefined>;
  remove(id: KeywordListId): Promise<void>;
}
