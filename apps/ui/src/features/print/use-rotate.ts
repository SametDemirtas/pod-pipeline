import { useMutation } from '@tanstack/react-query';
import type { RotateDesignDto } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useLatestMutation } from '../../shared/use-latest-mutation.js';

const useRotateApi = scopedApi<'rotateDesign'>();

/**
 * Turns the design's artwork to fit its print area. The design and its print
 * checks load again on their own, as the app reports the catalog changed.
 */
export function useRotate(designId: string) {
  const api = useRotateApi();
  return useMutation<RotateDesignDto>({
    mutationKey: queryKeys.rotate(designId),
    mutationFn: () => api.rotateDesign({ id: designId }),
  });
}

/** The latest turning of a design, also one started before the page was left and opened again. */
export function useRotateRun(designId: string) {
  const { running, latest, error } = useLatestMutation(queryKeys.rotate(designId));
  const result = latest?.status === 'success' ? (latest.data as RotateDesignDto) : null;
  return { running, error, result };
}
