import type { ApiErrorPayload } from '@pod/contracts';
import {
  checkedItem,
  failedItem,
  nextStep,
  withStepState,
  type BatchItem,
  type BatchStep,
  type Clock,
} from '@pod/core';
import { AppClosingError } from '../../shared/app-error.js';
import type { BatchState } from './batch-state.js';
import { WorkStoppedError } from '../errors/work-stopped.js';
import type { BatchRun, BatchSteps, StepOutcome } from './step-runner.js';

export interface BatchWorkerDeps {
  readonly state: Pick<BatchState, 'stored' | 'saveJob' | 'saveItem' | 'startStep' | 'earlier'>;
  readonly steps: BatchSteps;
  readonly clock: Clock;
  /** The error as the window would show it, so a failed step reads the same. */
  readonly describeError: (error: unknown) => ApiErrorPayload;
  readonly logError: (error: unknown) => void;
}

/** Whether the step stopped because the job was cancelled or the app is closing. */
function stopped(error: unknown): boolean {
  return error instanceof WorkStoppedError || error instanceof AppClosingError;
}

/**
 * Works through the job one design and one step at a time, storing each
 * step's outcome, until no design waits, the job stops or the run breaks off.
 */
export class BatchWorker {
  constructor(private readonly deps: BatchWorkerDeps) {}

  /**
   * A run that breaks off, e.g. when the database cannot be written, pauses the
   * job, unless it was cancelled or the app is closing meanwhile.
   */
  async run(run: BatchRun, signal: AbortSignal): Promise<void> {
    try {
      await this.work(run, signal);
    } catch (error) {
      await this.paused(error, signal);
    }
  }

  private async paused(error: unknown, signal: AbortSignal): Promise<void> {
    const { state, logError } = this.deps;
    logError(error);
    const { job } = state.stored();
    if (signal.aborted || job.state !== 'running') return;
    await state.saveJob({ ...job, state: 'paused' }).catch(logError);
  }

  /** A job with nothing left finishes, even when it was stopped during its last step. */
  private async work(run: BatchRun, signal: AbortSignal): Promise<void> {
    const { state } = this.deps;
    for (;;) {
      const item = state.stored().items.find((candidate) => nextStep(candidate) !== undefined);
      const step = item && nextStep(item);
      if (!item || !step) {
        const job = state.stored().job;
        await state.saveJob({ ...job, state: 'finished', finishedAt: this.deps.clock.now() });
        return;
      }
      if (signal.aborted || !(await this.runStep(item, step, run, signal))) return;
    }
  }

  /** Resolves with whether the job may go on; not when the step was stopped. */
  private async runStep(
    item: BatchItem,
    step: BatchStep,
    run: BatchRun,
    signal: AbortSignal,
  ): Promise<boolean> {
    const { state } = this.deps;
    state.startStep({ designKey: item.designKey, step });
    // Stored first, so a draft cut off by a crash is known to be uncertain.
    const started = withStepState(item, step, 'running');
    await state.saveItem(started);
    const outcome = await this.deps.steps[step](started, run, signal).catch(
      (error: unknown): StepOutcome => ({ state: 'failed', error, prepared: {} }),
    );
    const interrupted = outcome.state === 'failed' && stopped(outcome.error);
    await state.saveItem(this.settled(this.withCheckedDrafts(started), step, outcome));
    return !interrupted;
  }

  /** The item as the step began, but with drafts the seller checked meanwhile. */
  private withCheckedDrafts(started: BatchItem): BatchItem {
    const now = this.deps.state.earlier(started.designId);
    return started.draftCheck && now?.draftCheck === null ? checkedItem(started) : started;
  }

  private settled(item: BatchItem, step: BatchStep, outcome: StepOutcome): BatchItem {
    const prepared = { ...item, ...outcome.prepared };
    if (outcome.state !== 'failed') return withStepState(prepared, step, outcome.state);
    if (stopped(outcome.error)) return withStepState(prepared, step, 'pending');
    return failedItem(prepared, { step, ...this.deps.describeError(outcome.error) });
  }
}
