/** Waits on a real timer; with a signal, stops waiting with its reason once it aborts. */
export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', stop, { once: true });
  });
}
