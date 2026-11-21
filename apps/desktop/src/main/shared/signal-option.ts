/** `{ signal }` when there is one, for options that may not hold `signal: undefined`. */
export function signalOption(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}
