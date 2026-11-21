import { draftStep } from './draft-step.js';
import { mockupsStep, printStep } from './print-steps.js';
import { researchStep } from './research-step.js';
import type { BatchSteps, BatchStepsDeps } from '../step-runner.js';
import { textStep } from './text-step.js';
import { upscaleStep } from './upscale-step.js';

/** Each step of preparing a listing, on the operations the window uses. */
export function batchSteps(deps: BatchStepsDeps): BatchSteps {
  return {
    upscale: upscaleStep(deps),
    print: printStep(deps.catalog, deps.settings),
    mockups: mockupsStep(deps.catalog, deps.settings, deps.wait),
    research: researchStep(deps),
    text: textStep(deps),
    draft: draftStep(deps),
  };
}
