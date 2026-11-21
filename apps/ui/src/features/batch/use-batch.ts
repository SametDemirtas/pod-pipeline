import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { BatchRequest, BatchStatusDto } from '@pod/contracts/client';
import { scopedApi } from '../../api/api-context.js';
import { queryKeys } from '../../api/query-keys.js';
import { useCachedChange } from '../../shared/use-cached-change.js';

const useBatchApi = scopedApi<
  | 'cancelBatch'
  | 'confirmDraftsChecked'
  | 'estimateBatch'
  | 'getBatchStatus'
  | 'onBatchChanged'
  | 'resumeBatch'
  | 'retryBatch'
  | 'startBatch'
>();

/** Keeps the run's status current as the app reports each step. */
export function useBatchSync(): void {
  const api = useBatchApi();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      api.onBatchChanged((status) => {
        queryClient.setQueryData(queryKeys.batchStatus, status);
      }),
    [api, queryClient],
  );
}

export function useBatchStatus() {
  const api = useBatchApi();
  return useQuery({ queryKey: queryKeys.batchStatus, queryFn: () => api.getBatchStatus() });
}

/** What the run would do, counted afresh each time; only asked while `request` is set. */
export function useBatchEstimate(request: BatchRequest | null) {
  const api = useBatchApi();
  return useQuery({
    queryKey: request ? queryKeys.batchEstimate(request) : ['batch', 'estimate'],
    queryFn: request ? () => api.estimateBatch(request) : skipToken,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Starts, cancels, resumes or retries the run; the answer replaces the cached status. */
function useBatchChange<T = void>(change: (input: T) => Promise<BatchStatusDto>) {
  return useCachedChange({ queryKey: queryKeys.batchStatus, change });
}

export function useStartBatch() {
  const api = useBatchApi();
  return useBatchChange((request: BatchRequest) => api.startBatch(request));
}

export function useCancelBatch() {
  const api = useBatchApi();
  return useBatchChange(() => api.cancelBatch());
}

export function useResumeBatch() {
  const api = useBatchApi();
  return useBatchChange(() => api.resumeBatch());
}

export function useRetryBatch() {
  const api = useBatchApi();
  return useBatchChange(() => api.retryBatch());
}

/** Records that the seller checked their Etsy drafts for one design of the run. */
export function useConfirmDraftsChecked() {
  const api = useBatchApi();
  return useBatchChange((id: string) => api.confirmDraftsChecked({ id }));
}
