import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';

const useMcpLaunchApi = scopedApi<'getMcpLaunch'>();

/** How an assistant starts the app's MCP server; it changes only with the app. */
export function useMcpLaunch() {
  const api = useMcpLaunchApi();
  return useQuery({
    queryKey: queryKeys.mcpLaunch,
    queryFn: () => api.getMcpLaunch(),
    staleTime: Infinity,
  });
}
