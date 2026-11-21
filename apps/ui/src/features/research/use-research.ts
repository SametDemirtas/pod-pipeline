import { queryOptions, useQuery } from '@tanstack/react-query';
import type {
  DesktopApi,
  KeywordListDto,
  ResearchMarket,
  ResearchRunDto,
} from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useCachedChange } from '../../shared/use-cached-change.js';

const useResearchApi = scopedApi<
  | 'getKeywordList'
  | 'getResearch'
  | 'importKeywordList'
  | 'listKeywordLists'
  | 'listResearch'
  | 'removeKeywordList'
  | 'researchKeywords'
>();

/** One research run; it never changes once made. */
export function researchRunQuery(api: Pick<DesktopApi, 'getResearch'>, id: string) {
  return queryOptions({
    queryKey: queryKeys.researchRun(id),
    queryFn: () => api.getResearch({ id }),
    staleTime: Infinity,
  });
}

/** One imported keyword list; it never changes once imported. */
export function keywordListQuery(api: Pick<DesktopApi, 'getKeywordList'>, id: string) {
  return queryOptions({
    queryKey: queryKeys.keywordList(id),
    queryFn: () => api.getKeywordList({ id }),
    staleTime: Infinity,
  });
}

export function useResearchList() {
  const api = useResearchApi();
  return useQuery({ queryKey: queryKeys.researchList, queryFn: () => api.listResearch() });
}

export function useResearchRun(id: string | undefined) {
  const api = useResearchApi();
  return useQuery({ ...researchRunQuery(api, id ?? ''), enabled: id !== undefined });
}

export function useRunResearch() {
  const api = useResearchApi();
  return useCachedChange({
    queryKey: (run: ResearchRunDto) => queryKeys.researchRun(run.id),
    change: (request: { query: string; market: ResearchMarket }) => api.researchKeywords(request),
    // The new run opens at once; the list of runs catches up behind it.
    afterSaved: (_run, queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.researchList });
    },
  });
}

export function useKeywordLists() {
  const api = useResearchApi();
  return useQuery({ queryKey: queryKeys.keywordLists, queryFn: () => api.listKeywordLists() });
}

export function useKeywordList(id: string | undefined) {
  const api = useResearchApi();
  return useQuery({ ...keywordListQuery(api, id ?? ''), enabled: id !== undefined });
}

export function useImportKeywordList() {
  const api = useResearchApi();
  // `null` when the seller closed the file dialog, which leaves nothing to cache.
  return useCachedChange({
    queryKey: (list: KeywordListDto | null) => (list ? queryKeys.keywordList(list.id) : null),
    change: (market: ResearchMarket) => api.importKeywordList({ market }),
    afterSaved: (_list, queryClient) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.keywordLists }),
  });
}

/**
 * Removes a list. The removed list's own query is left to the cache, which
 * drops it once no page uses it; removing it while its page is still open
 * would only make the page ask for the list again.
 */
export function useRemoveKeywordList() {
  const api = useResearchApi();
  return useCachedChange({
    queryKey: queryKeys.keywordLists,
    change: (id: string) => api.removeKeywordList({ id }),
  });
}
