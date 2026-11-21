import {
  BATCH_STEP_STATES,
  isApiErrorCode,
  type ApiErrorPayload,
  type BatchJobDto,
  type BatchListingTextDto,
  type BatchStatusDto,
  type BatchStepDto,
  type BatchStepStateDto,
} from '@pod/contracts';
import {
  nextStep,
  type BatchFailure,
  type BatchItem,
  type PreparedText,
  type StoredBatch,
} from '@pod/core';

/** The design and step running now. */
export interface RunningStep {
  readonly designKey: string;
  readonly step: BatchStepDto;
}

function counts(items: readonly BatchItem[], step: BatchStepDto) {
  const zero = Object.fromEntries(BATCH_STEP_STATES.map((state) => [state, 0]));
  return items.reduce<Record<BatchStepStateDto, number>>(
    (count, item) => {
      const state = item.steps[step];
      return state === undefined ? count : { ...count, [state]: count[state] + 1 };
    },
    zero as Record<BatchStepStateDto, number>,
  );
}

function jobDto({ job, items }: StoredBatch, current: RunningStep | null): BatchJobDto {
  return {
    id: job.id,
    state: job.state,
    steps: job.steps,
    market: job.market,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    designs: items.length,
    settledDesigns: items.filter(
      (item) => nextStep(item) === undefined && !Object.values(item.steps).includes('running'),
    ).length,
    stepCounts: Object.fromEntries(job.steps.map((step) => [step, counts(items, step)])),
    current,
    failures: items.flatMap(({ designId, designKey, failure, draftCheck }) => {
      const shown = failure ?? draftCheck;
      return shown
        ? [
            {
              designId,
              designKey,
              step: shown.step,
              error: errorPayload(shown),
              draftCheck: draftCheck && errorPayload(draftCheck),
            },
          ]
        : [];
    }),
  };
}

function errorPayload({ code, message, details }: BatchFailure): ApiErrorPayload {
  return { code: isApiErrorCode(code) ? code : 'INTERNAL', message, details };
}

export function toBatchStatusDto(
  batch: StoredBatch | undefined,
  current: RunningStep | null,
): BatchStatusDto {
  return { job: batch ? jobDto(batch, current) : null };
}

/** The text a job wrote, as the window's listing form takes it. */
export function toBatchListingTextDto(prepared: PreparedText): BatchListingTextDto {
  const { text } = prepared;
  return {
    language: prepared.language,
    title: text.title,
    description: text.description,
    tags: [...text.tags],
    translations: prepared.translations.map((translation) => ({
      language: translation.language,
      title: translation.text.title,
      description: translation.text.description,
      tags: [...translation.text.tags],
    })),
  };
}
