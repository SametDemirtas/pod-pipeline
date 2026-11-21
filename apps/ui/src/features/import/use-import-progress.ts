import { useEffect, useState } from 'react';
import type { ImportProgressDto } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';

const useImportProgressApi = scopedApi<'onImportProgress'>();

/** Latest progress event while `active`; cleared whenever it becomes inactive. */
export function useImportProgress(active: boolean): ImportProgressDto | null {
  const api = useImportProgressApi();
  const [progress, setProgress] = useState<ImportProgressDto | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    return api.onImportProgress(setProgress);
  }, [api, active]);

  return progress;
}
