import { AsyncLocalStorage } from 'node:async_hooks';
import type { SqliteDatabase } from './database.js';

/** Runs a synchronous database operation when the caller is allowed to. */
export type Gate = <T>(operation: () => T) => Promise<T>;

/** For standalone calls: each operation waits for and takes the database lock. */
export function lockedGate(db: SqliteDatabase): Gate {
  return (operation) => db.exclusive(() => Promise.resolve(operation()));
}

/**
 * For one transaction. Create it inside the transaction: operations then run
 * under the transaction's lock from whatever async context they are called,
 * until the transaction settles.
 */
export class TransactionGate {
  private open = true;
  private readonly insideTransaction = AsyncLocalStorage.snapshot();

  readonly run: Gate = (operation) =>
    Promise.resolve().then(() => {
      if (!this.open) throw new Error('The transaction has already finished');
      return this.insideTransaction(operation);
    });

  close(): void {
    this.open = false;
  }
}
