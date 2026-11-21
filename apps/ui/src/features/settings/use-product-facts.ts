import { queryKeys } from '../../api/query-keys.js';
import { useUpdateSettings } from '../../shared/use-settings.js';

/** Saves product facts; print checks show them, so they are read again. */
export function useUpdateProductFacts() {
  return useUpdateSettings((_saved, queryClient) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.printChecks }),
  );
}
