import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchWordsOfRun } from '@pod/rules';
import { scopedApi } from '../../api/api-context.js';
import { searchWordsFromList } from './research-tags.js';
import { keywordListQuery, researchRunQuery } from './use-research.js';

const useSearchWordsApi = scopedApi<'getKeywordList' | 'getResearch'>();

/** An earlier Etsy search or an imported keyword list. */
interface SearchWordSource {
  readonly kind: 'run' | 'list';
  readonly id: string;
}

/** Reads the search words of a source, from the cache when it was read before. */
export function useReadSearchWords() {
  const api = useSearchWordsApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: SearchWordSource) =>
      kind === 'run'
        ? queryClient.query(researchRunQuery(api, id)).then(searchWordsOfRun)
        : queryClient.query(keywordListQuery(api, id)).then(searchWordsFromList),
  });
}
