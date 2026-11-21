import type { BatchItem } from '@pod/core';
import { whenFree } from '../busy-waits.js';
import type { BatchStepsDeps, StepOutcome } from '../step-runner.js';

/**
 * Turns the artwork when its orientation is the other one than the print
 * area's and its product hangs either way up, such as a blanket, after it was
 * made larger; `enlarged` is what making it larger did.
 */
export async function turnToFit(
  { rotation, wait }: Pick<BatchStepsDeps, 'rotation' | 'wait'>,
  item: BatchItem,
  enlarged: StepOutcome,
  signal: AbortSignal,
): Promise<StepOutcome> {
  const turned = await whenFree(
    () => rotation.rotateDesign({ id: item.designId }, signal),
    wait,
    signal,
  );
  if (turned.status !== 'rotated') return enlarged;
  return { state: 'done', prepared: { designRevision: turned.design.revision } };
}
