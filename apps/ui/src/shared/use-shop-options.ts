import { useQuery } from '@tanstack/react-query';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';
import { apiErrorCode } from './api-error-code.js';

const useShopOptionsApi = scopedApi<'getShopOptions'>();

/** The Etsy shop's currency, policies and profiles that listings choose from. */
export function useShopOptions(enabled: boolean) {
  const api = useShopOptionsApi();
  return useQuery({
    queryKey: queryKeys.shopOptions,
    queryFn: () => api.getShopOptions(),
    enabled,
    staleTime: 60_000,
    retry: (failures, error) => !isEtsyMissing(error) && failures < 2,
  });
}

export function isEtsyMissing(error: unknown): boolean {
  return apiErrorCode(error) === 'ETSY_NOT_CONNECTED';
}
