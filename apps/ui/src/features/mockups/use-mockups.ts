import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrintRequest } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useCachedChange } from '../../shared/use-cached-change.js';
import { useLatestMutation } from '../../shared/use-latest-mutation.js';

const useMockupsApi = scopedApi<'createMockups' | 'listMockups' | 'removeMockup' | 'savePhoto'>();

export function useMockups(designId: string) {
  const api = useMockupsApi();
  return useQuery({
    queryKey: queryKeys.mockups(designId),
    queryFn: () => api.listMockups({ id: designId }),
  });
}

export function useCreateMockups(designId: string) {
  const api = useMockupsApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.createMockups(designId),
    mutationFn: (request: PrintRequest) => api.createMockups(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mockups(designId) }),
  });
}

/**
 * The latest mockup run of a design, also one started before the page was
 * left and opened again, which the component's own mutation would not know.
 */
export function useMockupRun(designId: string) {
  const { running, latest, error } = useLatestMutation(queryKeys.createMockups(designId));
  return { running, error, succeeded: latest?.status === 'success' };
}

/** Saves a full-size copy of a photo where the seller picks; `false` when the dialog was cancelled. */
export function useSavePhoto(designId: string) {
  const api = useMockupsApi();
  return useMutation({
    mutationFn: (mockupId: string) => api.savePhoto({ designId, mockupId }),
  });
}

export function useRemoveMockup(designId: string) {
  const api = useMockupsApi();
  return useCachedChange({
    queryKey: queryKeys.mockups(designId),
    change: (mockupId: string) => api.removeMockup({ designId, mockupId }),
  });
}
