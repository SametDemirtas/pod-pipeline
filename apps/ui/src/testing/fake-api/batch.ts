import { vi } from 'vitest';
import type { BatchJobDto, BatchRequest, BatchStatusDto, DesktopApi } from '@pod/contracts/client';
import { batchEstimateDto, batchJobDto } from '../dtos/app-dtos.js';
import type { FakeState } from './fake-state.js';

/** Preparing listings in the background. */
export function fakeBatchApi(state: FakeState) {
  const changeBatch = (change: Partial<BatchJobDto>) => {
    state.batch = { job: state.batch.job && { ...state.batch.job, ...change } };
    return Promise.resolve(state.batch);
  };
  const startBatch = (request: BatchRequest) => {
    const { selection } = request;
    state.batch = {
      job: batchJobDto({
        steps: request.steps,
        market: request.market,
        designs: selection.kind === 'designs' ? selection.designIds.length : state.designs.length,
        settledDesigns: 0,
        current: null,
      }),
    };
    return Promise.resolve(state.batch);
  };
  return {
    getBatchStatus: vi.fn<DesktopApi['getBatchStatus']>(() => Promise.resolve(state.batch)),
    estimateBatch: vi.fn<DesktopApi['estimateBatch']>(() => Promise.resolve(batchEstimateDto())),
    startBatch: vi.fn<DesktopApi['startBatch']>(startBatch),
    cancelBatch: vi.fn<DesktopApi['cancelBatch']>(() => changeBatch({ state: 'cancelled' })),
    resumeBatch: vi.fn<DesktopApi['resumeBatch']>(() => changeBatch({ state: 'running' })),
    retryBatch: vi.fn<DesktopApi['retryBatch']>(() =>
      changeBatch({ state: 'running', failures: [] }),
    ),
    confirmDraftsChecked: vi.fn<DesktopApi['confirmDraftsChecked']>(({ id }) => {
      state.unchecked.delete(id);
      return changeBatch({
        failures: state.batch.job?.failures.filter((failure) => failure.designId !== id) ?? [],
      });
    }),
    getBatchListingText: vi.fn<DesktopApi['getBatchListingText']>(() => Promise.resolve(null)),
    onBatchChanged: vi.fn((listener: (status: BatchStatusDto) => void) => {
      state.batchListeners.add(listener);
      return () => {
        state.batchListeners.delete(listener);
      };
    }),
  };
}
