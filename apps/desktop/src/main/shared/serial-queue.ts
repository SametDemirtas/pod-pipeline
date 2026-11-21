/** Runs operations one after another, in the order they were added. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    // A failure belongs to its caller; the next operation runs either way.
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Resolves once everything added so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
