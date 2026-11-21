import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';

const useDesignListApi = scopedApi<'listDesigns'>();

export interface DesignFilter {
  readonly familyId?: string | undefined;
  readonly search?: string | undefined;
}

/**
 * Pages through the catalog with the cursor each page returns. While a new
 * filter loads, the previous results stay on screen instead of flashing away.
 */
export function useDesignList(filter: DesignFilter) {
  const api = useDesignListApi();

  return useInfiniteQuery({
    queryKey: queryKeys.designList(filter),
    queryFn: ({ pageParam }) => api.listDesigns({ ...filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}
