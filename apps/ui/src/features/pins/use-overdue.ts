import { useEffect, useState } from 'react';

/** A pin this late did not go out at its time, for want of Pinterest or of approval. */
export const OVERDUE_MS = 5 * 60_000;

/** Browsers fire a longer timeout at once, so a far-off time is waited for in steps. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/** Whether a waiting pin's time is long past; turns true while the page stays open. */
export function useOverdue(publishAt: string, waiting: boolean): boolean {
  const due = Date.parse(publishAt) + OVERDUE_MS;
  const [now, setNow] = useState(() => Date.now());
  const overdue = now > due;

  useEffect(() => {
    if (!waiting || overdue || Number.isNaN(due)) return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
      },
      Math.min(due - now + 1, LONGEST_WAIT_MS),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, overdue, due, now]);

  return waiting && overdue;
}
