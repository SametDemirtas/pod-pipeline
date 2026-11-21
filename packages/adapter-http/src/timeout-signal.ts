/** Aborts after `milliseconds`, or earlier when `signal` does, e.g. when the seller cancels. */
export function withTimeout(signal: AbortSignal | undefined, milliseconds: number): AbortSignal {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
