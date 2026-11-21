import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';

const useCatalogSyncApi = scopedApi<'onCatalogChanged'>();

/**
 * Refreshes every loaded design query when any client changes the catalog, and
 * the connections, whose sign-in may have needed saving during that work.
 */
export function useCatalogSync(): void {
  const api = useCatalogSyncApi();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      api.onCatalogChanged(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.designs });
        void queryClient.invalidateQueries({ queryKey: queryKeys.connections });
      }),
    [api, queryClient],
  );
}
