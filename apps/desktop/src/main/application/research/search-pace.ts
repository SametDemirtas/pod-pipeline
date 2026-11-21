const HOUR_MS = 3_600_000;

export interface SearchPaceOptions {
  /** Least time between two searches. */
  readonly gapMs: number;
  readonly perHour: number;
  /** Milliseconds since the epoch, from the clock the app is given. */
  readonly now: () => number;
}

/** Keeps searches as far apart, and as few per hour, as a person would make them. */
export class SearchPace {
  private started: number[] = [];

  constructor(private readonly options: SearchPaceOptions) {}

  /** Counts a search that starts now and returns 0, or returns how long to wait when it is too soon. */
  take(): number {
    const now = this.options.now();
    this.started = this.started.filter((time) => now - time < HOUR_MS);
    const last = this.started[this.started.length - 1];
    const oldest = this.started[0];
    const wait = Math.max(
      last === undefined ? 0 : last + this.options.gapMs - now,
      oldest === undefined || this.started.length < this.options.perHour
        ? 0
        : oldest + HOUR_MS - now,
    );
    if (wait === 0) this.started.push(now);
    return wait;
  }
}
