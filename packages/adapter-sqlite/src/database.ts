import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { foldForSearch } from '@pod/core';
import { migrate, type Migration } from './migrations.js';
import { CATALOG_MIGRATIONS } from './schema.js';

interface LockHolder {
  active: boolean;
}

/**
 * Owns the single SQLite connection and serialises access to it.
 *
 * node:sqlite is synchronous, but repositories are async and a transaction may
 * await other work while it is open. Every operation therefore runs under one
 * lock, so another caller can never slip a write into an open transaction or
 * read its uncommitted rows. Code running under the lock may not take it
 * again; callbacks that fire after it was released queue like everyone else.
 */
export class SqliteDatabase {
  private readonly connection: DatabaseSync;
  private readonly holder = new AsyncLocalStorage<LockHolder>();
  private readonly statements = new Map<string, StatementSync>();
  private tail: Promise<unknown> = Promise.resolve();
  private inTransaction = false;

  private constructor(connection: DatabaseSync) {
    this.connection = connection;
  }

  static open(
    location: string,
    migrations: readonly Migration[] = CATALOG_MIGRATIONS,
  ): SqliteDatabase {
    const connection = new DatabaseSync(location);
    try {
      connection.exec('PRAGMA foreign_keys = ON');
      connection.exec('PRAGMA busy_timeout = 5000');
      if (location !== ':memory:') {
        connection.exec('PRAGMA journal_mode = WAL');
        connection.exec('PRAGMA synchronous = NORMAL');
      }
      connection.function('casefold', { deterministic: true }, (value) =>
        typeof value === 'string' ? foldForSearch(value) : null,
      );
      migrate(connection, migrations);
    } catch (error) {
      connection.close();
      throw error;
    }
    return new SqliteDatabase(connection);
  }

  /** Waits for running work to finish, then closes the connection. */
  close(): Promise<void> {
    return this.exclusive(() => {
      this.statements.clear();
      this.connection.close();
      return Promise.resolve();
    });
  }

  /** Runs `work` with exclusive use of the connection. Always settles asynchronously. */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.holdsLock()) {
      return Promise.reject(
        new Error('The catalog cannot be used from inside another catalog operation'),
      );
    }
    const run = this.tail.then(async () => {
      const holder: LockHolder = { active: true };
      try {
        return await this.holder.run(holder, work);
      } finally {
        holder.active = false;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * Runs `work` inside one transaction under the lock. Every write commits
   * together or none does; the original error is kept if rollback fails.
   */
  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      if (this.connection.isTransaction) {
        throw new Error('The connection has a transaction that was never finished');
      }
      this.connection.exec('BEGIN IMMEDIATE');
      this.inTransaction = true;
      try {
        const result = await work();
        this.connection.exec('COMMIT');
        return result;
      } catch (error) {
        this.rollbackQuietly();
        throw error;
      } finally {
        this.inTransaction = false;
      }
    });
  }

  /**
   * Runs synchronous statements atomically: joins the transaction started by
   * `transaction()`, or wraps them in their own one. Requires the lock.
   */
  atomically<T>(statements: () => T): T {
    this.assertLocked();
    if (this.inTransaction) return statements();
    if (this.connection.isTransaction) {
      throw new Error('The connection has a transaction that was never finished');
    }
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = statements();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.rollbackQuietly();
      throw error;
    }
  }

  /** Returns a cached prepared statement. Requires the lock. */
  prepare(sql: string): StatementSync {
    this.assertLocked();
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.connection.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private holdsLock(): boolean {
    return this.holder.getStore()?.active === true;
  }

  private assertLocked(): void {
    if (!this.holdsLock()) throw new Error('The database lock is not held');
  }

  private rollbackQuietly(): void {
    if (!this.connection.isTransaction) return;
    try {
      this.connection.exec('ROLLBACK');
    } catch {
      // SQLite may already have rolled back; the caller's error is the one that matters.
    }
  }
}
