import { SqliteBatchRepository } from '@pod/adapter-sqlite';
import type { AiCatalogDto, CatalogApi } from '@pod/contracts';
import { LISTING_RULES } from '@pod/rules';
import { toApiError } from '../../api/to-api-error.js';
import { estimateBatch } from '../../application/batch/batch-estimate.js';
import { BatchService } from '../../application/batch/batch-service.js';
import { batchSteps } from '../../application/batch/steps/batch-steps.js';
import { waitWith } from '../../application/batch/busy-waits.js';
import { UncheckedDrafts } from '../../application/batch/unchecked-drafts.js';
import { DraftMayExistError } from '../../application/errors/listing-errors.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import type { TextService } from '../../application/listing/text-service.js';
import type { RotationService } from '../../application/print/rotation-service.js';
import type { UpscaleService } from '../../application/print/upscale-service.js';
import type { KeywordListService } from '../../application/research/keyword-list-service.js';
import type { SharedParts } from '../shared-parts.js';
import { systemTimers } from '../system-timers.js';

export interface BatchProviders {
  /** Every operation but the batch's own, with the services' locks and pacing. */
  readonly catalog: Omit<CatalogApi, 'getBatchStatus'>;
  readonly text: TextService;
  readonly upscale: Pick<UpscaleService, 'upscaleDesign'>;
  readonly rotation: Pick<RotationService, 'rotateDesign'>;
  readonly keywordLists: Pick<KeywordListService, 'listKeywordLists' | 'getKeywordList'>;
  readonly settings: SettingsStore;
  readonly aiCatalog: AiCatalogDto;
}

/** Preparing listings for many designs, stored next to the catalog. */
export function createBatchService(
  parts: Pick<SharedParts, 'clock' | 'ids' | 'options' | 'database' | 'draftChecks'>,
  providers: BatchProviders,
): BatchService {
  const { catalog, settings } = providers;
  const { clock, options } = parts;
  const log = options.logError;
  return new BatchService({
    jobs: new SqliteBatchRepository(parts.database),
    drafts: new UncheckedDrafts({
      checks: parts.draftChecks,
      catalog,
      unconfirmed: () => ({ step: 'draft', ...toApiError(new DraftMayExistError(), log) }),
    }),
    catalog,
    steps: batchSteps({
      catalog,
      text: providers.text,
      upscale: providers.upscale,
      rotation: providers.rotation,
      keywordLists: providers.keywordLists,
      settings,
      clock,
      wait: waitWith(systemTimers),
      rules: LISTING_RULES,
    }),
    estimate: (designs, request, earlier, unchecked) =>
      estimateBatch(
        { catalog, settings, aiCatalog: providers.aiCatalog },
        designs,
        request,
        earlier,
        unchecked,
      ),
    clock,
    ids: parts.ids,
    describeError: (error) => toApiError(error, options.logError),
    events: options.events,
    logError: options.logError,
  });
}
