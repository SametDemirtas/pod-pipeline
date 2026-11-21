import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';

const useConnectionsApi = scopedApi<'getConnections'>();

export function useConnections() {
  const api = useConnectionsApi();
  return useQuery({ queryKey: queryKeys.connections, queryFn: () => api.getConnections() });
}
