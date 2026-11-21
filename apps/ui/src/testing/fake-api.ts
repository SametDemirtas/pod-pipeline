import type {
  BatchStatusDto,
  DesignDto,
  DesktopApi,
  ImportProgressDto,
  UpscaleProgressDto,
} from '@pod/contracts/client';
import { fakeBatchApi } from './fake-api/batch.js';
import { fakeCatalogApi } from './fake-api/catalog.js';
import { fakeConnectionsApi } from './fake-api/connections.js';
import { createFakeState, notifyCatalogChanged } from './fake-api/fake-state.js';
import { fakeListingApi } from './fake-api/listing.js';
import { fakePinsApi } from './fake-api/pins.js';
import { fakePrintApi } from './fake-api/print.js';
import { fakeResearchApi } from './fake-api/research.js';
import { fakeSettingsApi } from './fake-api/settings.js';

export * from './dtos/app-dtos.js';
export * from './dtos/catalog-dtos.js';
export * from './dtos/listing-dtos.js';

/** In-memory stand-in for the desktop bridge; every method is a spy. */
export function createFakeApi(designs: readonly DesignDto[] = []) {
  const state = createFakeState(designs);
  const api = {
    ...fakeCatalogApi(state),
    ...fakePrintApi(state),
    ...fakeListingApi(state),
    ...fakeResearchApi(state),
    ...fakePinsApi(state),
    ...fakeSettingsApi(state),
    ...fakeConnectionsApi(state),
    ...fakeBatchApi(state),
  } satisfies DesktopApi;

  return {
    api,
    emitProgress: (progress: ImportProgressDto) => {
      for (const listener of state.progressListeners) listener(progress);
    },
    emitCatalogChanged: () => {
      notifyCatalogChanged(state);
    },
    /** Marks the design as one whose draft may be on Etsy. */
    markDraftUnchecked: (designId: string) => {
      state.unchecked.add(designId);
    },
    emitBatchChanged: (status: BatchStatusDto) => {
      state.batch = status;
      for (const listener of state.batchListeners) listener(status);
    },
    emitUpscaleProgress: (progress: UpscaleProgressDto) => {
      for (const listener of state.upscaleListeners) listener(progress);
    },
  };
}
