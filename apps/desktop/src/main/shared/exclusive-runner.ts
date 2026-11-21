import { AppClosingError } from './app-error.js';

/**
 * Lets one operation per key run at a time and refuses the rest instead of
 * queueing them, so a double click can never start the same work twice while
 * work under other keys, such as other designs, goes ahead.
 */
export class KeyedExclusiveRunner {
  private readonly running = new Map<string, Promise<unknown>>();
  private closed = false;

  constructor(private readonly busy: () => Error) {}

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new AppClosingError();
    if (this.running.has(key)) throw this.busy();
    const result = operation();
    this.running.set(key, result);
    try {
      return await result;
    } finally {
      this.running.delete(key);
    }
  }

  /** Resolves once every operation running now has finished, however it ended. */
  async idle(): Promise<void> {
    await Promise.allSettled(this.running.values());
  }

  /** Refuses new operations from now on and resolves once those running now have finished. */
  close(): Promise<void> {
    this.closed = true;
    return this.idle();
  }
}

/** Lets one operation run at a time and refuses the rest instead of queueing them. */
export class ExclusiveRunner {
  private readonly keyed: KeyedExclusiveRunner;

  constructor(busy: () => Error) {
    this.keyed = new KeyedExclusiveRunner(busy);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return this.keyed.run('', operation);
  }

  idle(): Promise<void> {
    return this.keyed.idle();
  }

  close(): Promise<void> {
    return this.keyed.close();
  }
}
