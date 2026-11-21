import { vi } from 'vitest';
import type { DesktopApi } from '@pod/contracts/client';
import { keywordListDto, researchRunDto } from '../dtos/listing-dtos.js';
import type { FakeState } from './fake-state.js';

/** Etsy research runs and keyword lists. */
export function fakeResearchApi(state: FakeState) {
  const listSummaries = () =>
    state.keywordLists.map(({ id, fileName, market, importedAt, keywords }) => ({
      id,
      fileName,
      market,
      importedAt,
      keywordCount: keywords.length,
    }));
  return {
    researchKeywords: vi.fn<DesktopApi['researchKeywords']>(({ query, market }) => {
      const run = researchRunDto(`run-${state.runs.length + 1}`, query, market);
      state.runs = [run, ...state.runs];
      return Promise.resolve(run);
    }),
    listResearch: vi.fn<DesktopApi['listResearch']>(() =>
      Promise.resolve(
        state.runs.map((run) => ({
          id: run.id,
          query: run.query,
          market: run.market,
          createdAt: run.createdAt,
          resultsLabel: run.report.resultsLabel,
          topTerms: run.report.terms.slice(0, 5).map((term) => term.term),
        })),
      ),
    ),
    getResearch: vi.fn<DesktopApi['getResearch']>(({ id }) => {
      const run = state.runs.find((candidate) => candidate.id === id);
      return run ? Promise.resolve(run) : Promise.reject(new Error(`no run ${id}`));
    }),
    importKeywordList: vi.fn<DesktopApi['importKeywordList']>(({ market }) => {
      const list = keywordListDto(`list-${state.keywordLists.length + 1}`, market);
      state.keywordLists = [list, ...state.keywordLists];
      return Promise.resolve(list);
    }),
    listKeywordLists: vi.fn<DesktopApi['listKeywordLists']>(() => Promise.resolve(listSummaries())),
    removeKeywordList: vi.fn<DesktopApi['removeKeywordList']>(({ id }) => {
      state.keywordLists = state.keywordLists.filter((list) => list.id !== id);
      return Promise.resolve(listSummaries());
    }),
    getKeywordList: vi.fn<DesktopApi['getKeywordList']>(({ id }) => {
      const list = state.keywordLists.find((candidate) => candidate.id === id);
      return list ? Promise.resolve(list) : Promise.reject(new Error(`no list ${id}`));
    }),
  };
}
