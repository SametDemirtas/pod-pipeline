import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  /** Strictly increasing, starting at 1. */
  readonly version: number;
  readonly name: string;
  /**
   * Runs inside a transaction. `PRAGMA foreign_keys` cannot be changed there,
   * so a migration that rebuilds a table must keep foreign keys valid itself.
   */
  readonly sql: string;
  /**
   * Runs with foreign keys off, for rebuilding a table other tables refer to;
   * every reference is checked before the migration commits.
   */
  readonly foreignKeysOff?: boolean;
}

/**
 * Applies every migration newer than the database's recorded version, each in
 * its own transaction. Safe when two processes open the same file at once, and
 * refuses to open a database written by a newer release.
 */
export function migrate(connection: DatabaseSync, migrations: readonly Migration[]): number {
  assertOrdered(migrations);
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL
    )
  `);

  const latest = migrations.at(-1)?.version ?? 0;
  const current = recordedVersion(connection);
  if (current > latest) {
    throw new Error(
      `The database uses schema version ${current}, but this release only knows up to ${latest}`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    // Foreign keys can only be switched off outside a transaction.
    const keysOff = migration.foreignKeysOff === true && foreignKeysOn(connection);
    if (keysOff) connection.exec('PRAGMA foreign_keys = OFF');
    try {
      apply(connection, migration);
    } finally {
      if (keysOff) connection.exec('PRAGMA foreign_keys = ON');
    }
  }
  return latest;
}

function apply(connection: DatabaseSync, migration: Migration): void {
  connection.exec('BEGIN IMMEDIATE');
  try {
    if (recordedVersion(connection) < migration.version) {
      connection.exec(migration.sql);
      if (migration.foreignKeysOff) assertReferencesKept(connection);
      connection
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
    }
    connection.exec('COMMIT');
  } catch (error) {
    rollbackQuietly(connection);
    throw new Error(`Migration ${migration.version} (${migration.name}) failed`, {
      cause: error,
    });
  }
}

function foreignKeysOn(connection: DatabaseSync): boolean {
  return connection.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'] === 1;
}

function assertReferencesKept(connection: DatabaseSync): void {
  const broken = connection.prepare('PRAGMA foreign_key_check').all();
  if (broken.length > 0) {
    const tables = [...new Set(broken.map((row) => String(row['table'])))].join(', ');
    throw new Error(
      `${String(broken.length)} rows in ${tables} refer to rows that no longer exist`,
    );
  }
}

function recordedVersion(connection: DatabaseSync): number {
  const row = connection.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  return typeof row?.['version'] === 'number' ? row['version'] : 0;
}

function assertOrdered(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration "${migration.name}" has version ${migration.version}; expected ${index + 1}`,
      );
    }
  });
}

function rollbackQuietly(connection: DatabaseSync): void {
  if (!connection.isTransaction) return;
  try {
    connection.exec('ROLLBACK');
  } catch {
    // The migration's own error is the one worth reporting.
  }
}
