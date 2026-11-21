import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { SettingsDto, UpdateSettingsRequest } from '@pod/contracts/client';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';
import { useCachedChange } from './use-cached-change.js';

const useSettingsApi = scopedApi<'getSettings' | 'updateSettings'>();

export function useSettings() {
  const api = useSettingsApi();
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => api.getSettings() });
}

/** Saves one setting; the saved settings replace the cached ones. */
export function useUpdateSettings(
  onSaved?: (saved: SettingsDto, queryClient: QueryClient) => unknown,
) {
  const api = useSettingsApi();
  return useCachedChange({
    queryKey: queryKeys.settings,
    change: (change: UpdateSettingsRequest) => api.updateSettings(change),
    afterSaved: onSaved,
  });
}
