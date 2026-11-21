import { AppClosingError } from '../../shared/app-error.js';

/** Work was stopped on purpose by whoever asked for it, e.g. a cancelled job. */
export class WorkStoppedError extends Error {
  constructor(message = 'The work was stopped') {
    super(message);
    this.name = new.target.name;
  }
}

/** Stopped work fails in its own way, e.g. a PNG worker ending mid-file, so the stop is told apart here. */
export function stoppedOr(
  error: unknown,
  closing: AbortSignal,
  signal: AbortSignal | undefined,
): unknown {
  if (closing.aborted) return new AppClosingError();
  if (signal?.aborted && !(error instanceof WorkStoppedError)) return new WorkStoppedError();
  return error;
}
