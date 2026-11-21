import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';

const useDesignApi = scopedApi<'getDesign'>();

export function useDesign(id: string) {
  const api = useDesignApi();
  return useQuery({ queryKey: queryKeys.design(id), queryFn: () => api.getDesign({ id }) });
}
