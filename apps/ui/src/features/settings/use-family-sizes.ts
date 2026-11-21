import { skipToken, useQuery } from '@tanstack/react-query';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';

const useFamilySizesApi = scopedApi<'listFamilySizes'>();

/** The sizes Printful sells a product in; asked only once a product is chosen. */
export function useFamilySizes(familyId: string | undefined) {
  const api = useFamilySizesApi();
  return useQuery({
    queryKey: queryKeys.familySizes(familyId ?? ''),
    queryFn: familyId === undefined ? skipToken : () => api.listFamilySizes({ familyId }),
    staleTime: Infinity,
  });
}
