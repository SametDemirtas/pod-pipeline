/** Stops a timer before it calls back again. */
export type CancelTimer = () => void;

/** The runtime's timers, given from outside so use cases and helpers keep no global state. */
export interface Timers {
  /** Calls `callback` once, `ms` from now. */
  readonly after: (ms: number, callback: () => void) => CancelTimer;
  /** Calls `callback` every `ms` until cancelled. */
  readonly every: (ms: number, callback: () => void) => CancelTimer;
}
