import type { Timers } from './timers.js';

/**
 * Waits for `work` to settle, but at most `milliseconds`, so a hung request
 * cannot keep the app from ending. Resolves with whether the work settled in
 * time; a failure is left to whoever started the work to report.
 */
export async function waitAtMost(
  work: Promise<unknown>,
  milliseconds: number,
  timers: Pick<Timers, 'after'>,
): Promise<boolean> {
  let cancel = (): void => undefined;
  const timeUp = new Promise<boolean>((resolve) => {
    cancel = timers.after(milliseconds, () => {
      resolve(false);
    });
  });
  try {
    return await Promise.race([work.then(settled, settled), timeUp]);
  } finally {
    cancel();
  }
}

function settled(): boolean {
  return true;
}

/** Work under way when the app closes, and what is lost if it is cut off. */
export interface ClosingWork {
  readonly close: () => Promise<void>;
  /** How long closing waits for it. */
  readonly withinMs: number;
  /** What may be left undone when it is cut off, for the log. */
  readonly risk: string;
}

/** Closes every part at once and resolves with the risks of those that did not finish in time. */
export async function closeWithin(
  parts: readonly ClosingWork[],
  timers: Pick<Timers, 'after'>,
): Promise<readonly string[]> {
  const finished = await Promise.all(
    parts.map((part) => waitAtMost(part.close(), part.withinMs, timers)),
  );
  return parts.filter((_, index) => !finished[index]).map((part) => part.risk);
}

/**
 * Closes every part, then `store`, which they write to. When a part is late
 * its work may still write, so the store is left to close with the process
 * and what may be lost is logged.
 */
export async function closeAllThen(
  parts: readonly ClosingWork[],
  store: { close(): Promise<void> },
  logError: (error: unknown) => void,
  timers: Pick<Timers, 'after'>,
): Promise<void> {
  const late = await closeWithin(parts, timers);
  if (late.length > 0) {
    logError(new Error(`Closed while work was still running: ${late.join('; ')}`));
    return;
  }
  await store.close();
}
