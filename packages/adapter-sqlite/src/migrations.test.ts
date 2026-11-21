import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, type Migration } from './migrations.js';
import { CATALOG_MIGRATIONS } from './schema.js';

const connections: DatabaseSync[] = [];

function connect(): DatabaseSync {
  const connection = new DatabaseSync(':memory:');
  connections.push(connection);
  return connection;
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});

function tables(connection: DatabaseSync): string[] {
  return connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row['name']));
}

const first: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER)' };
const second: Migration = { version: 2, name: 'two', sql: 'CREATE TABLE b (id INTEGER)' };

describe('migrate', () => {
  it('creates the catalog schema', () => {
    const connection = connect();

    expect(migrate(connection, CATALOG_MIGRATIONS)).toBe(CATALOG_MIGRATIONS.length);
    expect(tables(connection)).toEqual([
      'batch_draft_checks',
      'batch_items',
      'batch_jobs',
      'concepts',
      'design_revisions',
      'designs',
      'keyword_lists',
      'listing_products',
      'listings',
      'mockups',
      'pins',
      'research_runs',
      'schema_migrations',
    ]);
  });

  it('applies only migrations that are not recorded yet', () => {
    const connection = connect();
    migrate(connection, [first]);

    expect(migrate(connection, [first, second])).toBe(2);
    expect(migrate(connection, [first, second])).toBe(2);
    expect(tables(connection)).toEqual(['a', 'b', 'schema_migrations']);
    const versions = connection
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => [row['version'], row['name']]);
    expect(versions).toEqual([
      [1, 'one'],
      [2, 'two'],
    ]);
  });

  it('rolls back a failing migration completely', () => {
    const connection = connect();
    const broken: Migration = {
      version: 2,
      name: 'broken',
      sql: 'CREATE TABLE b (id INTEGER); CREATE TABLE a (id INTEGER);',
    };
    migrate(connection, [first]);

    expect(() => migrate(connection, [first, broken])).toThrow(/Migration 2 \(broken\) failed/);
    expect(tables(connection)).toEqual(['a', 'schema_migrations']);
  });

  it('rebuilds a table others refer to with foreign keys off, then on again', () => {
    const connection = connect();
    connection.exec('PRAGMA foreign_keys = ON');
    const parent: Migration = {
      version: 1,
      name: 'parent',
      sql: `
        CREATE TABLE p (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE c (id INTEGER PRIMARY KEY, p_id INTEGER NOT NULL REFERENCES p (id));
        INSERT INTO p VALUES (1, 'one');
        INSERT INTO c VALUES (1, 1);
      `,
    };
    const rebuild = (version: number, sql: string): Migration => ({
      version,
      name: 'rebuild',
      foreignKeysOff: true,
      sql: `
        CREATE TABLE p_next (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO p_next SELECT * FROM p ${sql};
        DROP TABLE p;
        ALTER TABLE p_next RENAME TO p;
      `,
    });
    migrate(connection, [parent]);

    expect(() => migrate(connection, [parent, rebuild(2, 'WHERE id = 2')])).toThrow(
      expect.objectContaining({
        message: 'Migration 2 (rebuild) failed',
        cause: new Error('1 rows in c refer to rows that no longer exist'),
      }),
    );
    expect(migrate(connection, [parent, rebuild(2, '')])).toBe(2);
    expect(connection.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => {
      connection.exec('INSERT INTO c VALUES (2, 9)');
    }).toThrow(/FOREIGN KEY/);
    connection.exec('INSERT INTO p VALUES (2, NULL)');
  });

  it('refuses a database created by a newer release', () => {
    const connection = connect();
    migrate(connection, [first, second]);

    expect(() => migrate(connection, [first])).toThrow(/schema version 2/);
  });

  it('refuses migrations that are out of order', () => {
    expect(() => migrate(connect(), [second])).toThrow(/expected 1/);
    expect(() => migrate(connect(), [first, first])).toThrow(/expected 2/);
  });

  it('adds the turn of a revision to stored designs, empty for those made before', () => {
    const connection = connect();
    const turned = CATALOG_MIGRATIONS.findIndex((migration) => migration.name === 'turned designs');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, turned));
    // A revision on its own is enough to show what happens to stored rows.
    connection.exec('PRAGMA foreign_keys = OFF');
    connection.exec(`
      INSERT INTO design_revisions (design_id, revision, concept_id, family_id, sha256,
        storage_key, mime_type, width, height, byte_size, source_path, recorded_at)
      VALUES ('d', 1, 'c', 'blanket', 's', 'k', 'image/png', 1, 2, 3, '/p', '2026-11-06')
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    const columns = (table: string) =>
      connection
        .prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name LIKE 'rotation%'`)
        .all()
        .map((row) => row['name']);
    const turnedColumns = ['rotation', 'rotation_from_sha256', 'rotation_reason'];
    expect(columns('designs')).toEqual(turnedColumns);
    expect(columns('design_revisions')).toEqual(turnedColumns);
    expect(connection.prepare('SELECT rotation FROM design_revisions').get()).toEqual({
      rotation: null,
    });
    expect(() => {
      connection.exec('UPDATE design_revisions SET rotation = 45');
    }).toThrow(/CHECK/);
    connection.exec('UPDATE design_revisions SET rotation = 270');
  });

  it('adds the advice to leave artwork unturned to stored designs, empty for those before', () => {
    const connection = connect();
    const kept = CATALOG_MIGRATIONS.findIndex(
      (migration) => migration.name === 'artwork left unturned',
    );
    migrate(connection, CATALOG_MIGRATIONS.slice(0, kept));
    connection.exec('PRAGMA foreign_keys = OFF');
    connection.exec(`
      INSERT INTO designs (id, design_key, concept_id, family_id, revision, sha256, storage_key,
        mime_type, width, height, byte_size, source_path, created_at, updated_at)
      VALUES ('d', '01-blanket', 'c', 'blanket', 1, 's', 'k', 'image/png', 1, 2, 3, '/p',
        '2026-11-06', '2026-11-06')
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    const columns = (table: string) =>
      connection
        .prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name LIKE 'orientation%'`)
        .all()
        .map((row) => row['name']);
    expect(columns('designs')).toEqual(['orientation_kept_sha256', 'orientation_kept_reason']);
    expect(columns('design_revisions')).toEqual([]);
    expect(
      connection
        .prepare('SELECT orientation_kept_sha256, orientation_kept_reason FROM designs')
        .get(),
    ).toEqual({ orientation_kept_sha256: null, orientation_kept_reason: null });
  });
});
