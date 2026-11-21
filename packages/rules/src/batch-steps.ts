import { BATCH_STEPS, type BatchStepDto } from '@pod/contracts/client';

/** The steps a new run starts with; upscaling only when the settings turn it on. */
export function defaultBatchSteps(autoUpscale: boolean): BatchStepDto[] {
  return BATCH_STEPS.filter((step) => autoUpscale || step !== 'upscale');
}

/**
 * The steps with `step` turned on or off. A draft is made of the text and the
 * mockups, so turning it on turns those on, and turning either off turns it off.
 */
export function withBatchStep(
  steps: readonly BatchStepDto[],
  step: BatchStepDto,
  on: boolean,
): BatchStepDto[] {
  const chosen = new Set(steps);
  if (on) {
    chosen.add(step);
    if (step === 'draft') {
      chosen.add('text');
      chosen.add('mockups');
    }
  } else {
    chosen.delete(step);
    if (step === 'text' || step === 'mockups') chosen.delete('draft');
  }
  return BATCH_STEPS.filter((candidate) => chosen.has(candidate));
}
