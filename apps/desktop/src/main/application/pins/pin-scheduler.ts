import { AppClosingError } from '../../shared/app-error.js';
import type { CancelTimer, Timers } from '../../shared/timers.js';

export interface PinSchedulerOptions {
  readonly publishDue: () => Promise<unknown>;
  readonly logError: (error: unknown) => void;
  readonly timers: Pick<Timers, 'every'>;
  readonly intervalMs?: number;
}

/** Publishes due pins at start and then every minute, while the app runs. */
export class PinScheduler {
  private cancel: CancelTimer | undefined;
  private running: Promise<void> = Promise.resolve();
  private busy = false;

  constructor(private readonly options: PinSchedulerOptions) {}

  start(): void {
    if (this.cancel) return;
    this.tick();
    this.cancel = this.options.timers.every(this.options.intervalMs ?? 60_000, () => {
      this.tick();
    });
  }

  /** Stops the schedule and waits for a publish already under way. */
  async stop(): Promise<void> {
    this.cancel?.();
    this.cancel = undefined;
    await this.running;
  }

  private tick(): void {
    // A slow batch is not queued behind again; the next free minute picks up the rest.
    if (this.busy) return;
    this.busy = true;
    this.running = this.options
      .publishDue()
      .then(
        () => undefined,
        (error: unknown) => {
          // A run that starts as the app closes is refused, which is no fault.
          if (!(error instanceof AppClosingError)) this.options.logError(error);
        },
      )
      .finally(() => {
        this.busy = false;
      });
  }
}
