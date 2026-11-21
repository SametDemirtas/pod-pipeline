import type { DesignDetailDto } from '@pod/contracts';
import { importedRevisionOf } from '@pod/rules';
import { ArtworkTooSmallEvenUpscaledError, type BatchItem } from '@pod/core';
import { BatchDesignChangedError } from '../../errors/batch-errors.js';
import { whenFree } from '../busy-waits.js';
import { worstListedPrint } from './print-steps.js';
import {
  SKIPPED,
  type BatchCatalog,
  type BatchStepsDeps,
  type StepOutcome,
  type StepRunner,
} from '../step-runner.js';
import { turnToFit } from './turn-to-fit.js';

type UpscaleStepDeps = Pick<BatchStepsDeps, 'settings' | 'upscale' | 'rotation' | 'wait'> & {
  readonly catalog: Pick<BatchCatalog, 'getDesign' | 'checkPrint'>;
};

/**
 * Makes the artwork larger when it would print blurred on a size the listing
 * sells, then turns it when its orientation is the other one than the print
 * area's, so the steps after it use that copy. A copy made before that is
 * too small for a size listed since is made again.
 */
export function upscaleStep(deps: UpscaleStepDeps): StepRunner {
  return async (item, _run, signal) => {
    const design = await deps.catalog.getDesign({ id: item.designId });
    const larger = await enlarge(deps, design, item, signal);
    return turnToFit(deps, item, larger, signal);
  };
}

async function enlarge(
  { catalog, settings, upscale, wait }: UpscaleStepDeps,
  design: DesignDetailDto,
  item: BatchItem,
  signal: AbortSignal,
): Promise<StepOutcome> {
  const changedSince = design.revision !== item.designRevision;
  if (changedSince && importedRevisionOf(design) > item.designRevision) {
    throw new BatchDesignChangedError(item.designKey);
  }
  // Later steps use what the window made larger or turned since the run started.
  const unchanged: StepOutcome = changedSince
    ? { state: 'skipped', prepared: { designRevision: design.revision } }
    : SKIPPED;
  const worst = await worstListedPrint(catalog, settings, design);
  if (worst?.quality !== 'poor') return unchanged;
  try {
    const larger = await whenFree(
      () => upscale.upscaleDesign({ id: item.designId }, signal),
      wait,
      signal,
    );
    return { state: 'done', prepared: { designRevision: larger.revision } };
  } catch (error) {
    // The print step names the size it is still too small for.
    if (error instanceof ArtworkTooSmallEvenUpscaledError) return unchanged;
    throw error;
  }
}
