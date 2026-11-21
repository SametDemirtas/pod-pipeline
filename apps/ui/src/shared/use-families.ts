import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';

const useFamiliesApi = scopedApi<'listFamilies'>();

export function useFamilies() {
  const api = useFamiliesApi();
  return useQuery({ queryKey: queryKeys.families, queryFn: () => api.listFamilies() });
}
