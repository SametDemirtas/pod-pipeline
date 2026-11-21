import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DesignDetailDto } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { apiErrorCode } from '../../shared/api-error-code.js';
import { useLatestMutation } from '../../shared/use-latest-mutation.js';

const useUpscaleApi = scopedApi<'onUpscaleProgress' | 'upscaleDesign'>();

/**
 * Makes the design's artwork larger. The design and its print checks load
 * again on their own, as the app reports the catalog changed. `mutate` takes
 * the revision on screen, kept with the run so {@link useUpscaleRun} knows
 * which revision it was about; the app upscales the newest one either way.
 */
export function useUpscale(designId: string) {
  const api = useUpscaleApi();
  return useMutation<DesignDetailDto, Error, number>({
    mutationKey: queryKeys.upscale(designId),
    mutationFn: () => api.upscaleDesign({ id: designId }),
  });
}

/**
 * The latest upscaling of a design, also one started before the page was left
 * and opened again, and whether it found `revision` as large as upscaling makes it.
 */
export function useUpscaleRun(designId: string, revision: number) {
  const { running, latest, error } = useLatestMutation(queryKeys.upscale(designId));
  return {
    running,
    error,
    largest:
      latest?.variables === revision && apiErrorCode(error) === 'ARTWORK_TOO_SMALL_EVEN_UPSCALED',
  };
}

/** Share of the design's artwork made larger so far, while `active`; `null` before the first report. */
export function useUpscaleProgress(designId: string, active: boolean): number | null {
  const api = useUpscaleApi();
  const [share, setShare] = useState<number | null>(null);

  useEffect(() => {
    setShare(null);
    if (!active) return;
    return api.onUpscaleProgress((progress) => {
      if (progress.designId === designId) setShare(progress.share);
    });
  }, [api, designId, active]);

  return share;
}
