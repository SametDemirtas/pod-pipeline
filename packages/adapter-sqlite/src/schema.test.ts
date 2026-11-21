import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrations.js';
import { toMockup, toProductDetails } from './rows.js';
import { CATALOG_MIGRATIONS } from './schema.js';

let connection: DatabaseSync;

beforeEach(() => {
  connection = new DatabaseSync(':memory:');
  connection.exec('PRAGMA foreign_keys = ON');
  migrate(connection, CATALOG_MIGRATIONS.slice(0, 1));
  connection.exec(`
    INSERT INTO concepts (id, key, name, created_at) VALUES ('c1', '01', 'Tulip', 't');
    INSERT INTO concepts (id, key, name, created_at) VALUES ('c2', '120', 'Winter', 't');
  `);
});

afterEach(() => {
  connection.close();
});

function insertDesign(id: string, designKey: string, conceptId: string, familyId: string): void {
  connection
    .prepare(
      `INSERT INTO designs (id, design_key, concept_id, family_id, revision, sha256, storage_key,
         mime_type, width, height, byte_size, source_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 'h', 'k', 'image/png', 1, 1, 1, 'p', 't', 't')`,
    )
    .run(id, designKey, conceptId, familyId);
  connection
    .prepare(
      `INSERT INTO design_revisions (design_id, revision, concept_id, family_id, sha256,
         storage_key, mime_type, width, height, byte_size, source_path, recorded_at)
       VALUES (?, 1, ?, ?, 'h', 'k', 'image/png', 1, 1, 1, 'p', 't')`,
    )
    .run(id, conceptId, familyId);
}

function designKeys(): unknown[][] {
  return connection
    .prepare('SELECT id, design_key FROM designs ORDER BY id')
    .all()
    .map((row) => [row['id'], row['design_key']]);
}

describe('catalog schema', () => {
  it('turns letter design keys into concept key and family id', () => {
    insertDesign('d1', '01A', 'c1', 'phone-case');
    insertDesign('d2', '01B', 'c1', 'mug');
    insertDesign('d3', '120C', 'c2', 'blanket');

    migrate(connection, CATALOG_MIGRATIONS);

    expect(designKeys()).toEqual([
      ['d1', '01-phone-case'],
      ['d2', '01-mug'],
      ['d3', '120-blanket'],
    ]);
    expect(connection.prepare('SELECT COUNT(*) AS n FROM design_revisions').get()?.['n']).toBe(3);
  });

  it('leaves readable design keys as they are', () => {
    insertDesign('d1', '01-t-shirt', 'c1', 't-shirt');

    migrate(connection, CATALOG_MIGRATIONS);

    expect(designKeys()).toEqual([['d1', '01-t-shirt']]);
  });

  it('records old mockups as made for the main print area', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 3));
    connection
      .prepare(
        `INSERT INTO mockups (id, design_id, design_revision, variant_id, view, batch, position,
           sha256, storage_key, mime_type, width, height, byte_size, created_at)
         VALUES ('m1', 'd1', 1, '1320', 'Front', 1, 0, 'h', 'k', 'image/png', 1, 1, 1, 't')`,
      )
      .run();

    migrate(connection, CATALOG_MIGRATIONS);

    expect(connection.prepare('SELECT print_area FROM mockups').get()?.['print_area']).toBe(
      'default',
    );
  });

  it('reads scenes made before checks as unchecked, unconfirmed and without a known source', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 12));
    connection
      .prepare(
        `INSERT INTO mockups (id, design_id, design_revision, variant_id, print_area, view,
           scene_prompt, batch, position, sha256, storage_key, mime_type, width, height,
           byte_size, created_at)
         VALUES ('s1', 'd1', 1, '1320', 'default', 'Scene', 'on a table', 1, 0, 'h', 'k',
           'image/png', 1, 1, 1, '2026-10-01T00:00:00.000Z')`,
      )
      .run();

    migrate(connection, CATALOG_MIGRATIONS);

    const read = () => {
      const row = connection.prepare('SELECT * FROM mockups').get();
      return row && toMockup(row);
    };
    expect(read()).toMatchObject({
      scenePrompt: 'on a table',
      sceneCheck: null,
      printConfirmed: false,
      sourceAsset: null,
    });
    connection.exec(`UPDATE mockups SET scene_check_json = '{"same":true,"issues":[]}'`);
    expect(read()?.sceneCheck).toEqual({ same: true, issues: [], unverifiable: [] });
  });

  it('reads photos from before product details as not read, and refuses broken details', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 14));
    connection.exec(`
      INSERT INTO mockups (id, design_id, design_revision, variant_id, print_area, view, batch,
        position, sha256, storage_key, mime_type, width, height, byte_size, created_at)
      VALUES ('m1', 'd1', 1, '1320', 'default', 'Front', 1, 0, 'h', 'k', 'image/png', 1, 1, 1,
        '2026-10-01T00:00:00.000Z');
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    const read = () => {
      const row = connection.prepare('SELECT product_details_json FROM mockups').get();
      return row && toProductDetails(row);
    };
    expect(read()).toBeNull();
    connection.exec(`UPDATE mockups SET product_details_json = '{"product":"mug"}'`);
    expect(read).toThrow('Column product_details_json is not product details');
  });

  it('reads scenes from before looks without one, and a look with unknown options leniently', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 15));
    connection.exec(`
      INSERT INTO mockups (id, design_id, design_revision, variant_id, print_area, view,
        scene_prompt, batch, position, sha256, storage_key, mime_type, width, height, byte_size,
        created_at)
      VALUES ('s1', 'd1', 1, '1320', 'default', 'Scene', 'on a table', 1, 0, 'h', 'k',
        'image/png', 1, 1, 1, '2026-10-01T00:00:00.000Z');
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    const read = () => {
      const row = connection.prepare('SELECT * FROM mockups').get();
      return row && toMockup(row);
    };
    expect(read()).not.toHaveProperty('sceneLook');
    connection.exec(`UPDATE mockups SET scene_look_json = '{"shape":"3:4","blur":"soft"}'`);
    expect(read()?.sceneLook).toEqual({ shape: '3:4', blur: 'soft' });
    connection.exec(`UPDATE mockups SET scene_look_json = '{"shape":"5:4","blur":"heavy"}'`);
    expect(read()?.sceneLook).toEqual({ shape: '4:3' });
    connection.exec(`UPDATE mockups SET scene_look_json = '{"shape":'`);
    expect(read).toThrow(SyntaxError);
  });

  it('allows inactive listings and still removes their products with them', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 6));
    connection.exec(`
      INSERT INTO listings (id, design_id, design_revision, marketplace_id, state, print_area, fit,
        created_at) VALUES ('l1', 'd1', 1, '46', 'draft', 'default', 'contain', 't');
      INSERT INTO listing_products VALUES ('l1', 0, 'PF-1320', 'p1', '1320');
    `);

    migrate(connection, CATALOG_MIGRATIONS);
    connection.exec("UPDATE listings SET state = 'inactive'");
    connection.exec("DELETE FROM listings WHERE id = 'l1'");

    expect(connection.prepare('SELECT COUNT(*) AS n FROM listing_products').get()?.['n']).toBe(0);
  });

  it('keeps the products and the unique listing number through the rebuild', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 6));
    connection.exec(`
      INSERT INTO listings (id, design_id, design_revision, marketplace_id, state, print_area, fit,
        created_at) VALUES ('l1', 'd1', 1, '46', 'draft', 'default', 'contain', 't');
      INSERT INTO listing_products VALUES ('l1', 0, 'PF-1320', 'p1', '1320');
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    expect(connection.prepare('SELECT sku FROM listing_products').get()?.['sku']).toBe('PF-1320');
    insertDesign('d2', '02-mug', 'c1', 'mug');
    expect(() => {
      connection.exec(`
        INSERT INTO listings (id, design_id, design_revision, marketplace_id, state, print_area,
          fit, created_at) VALUES ('l2', 'd2', 1, '46', 'draft', 'default', 'contain', 't');
      `);
    }).toThrow(/UNIQUE/);
  });

  it('keeps pins through the rebuild that adds the publishing state', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 10));
    const insertPin = (id: string, state: string) =>
      connection
        .prepare(
          `INSERT INTO pins (id, design_id, mockup_id, title, description, alt_text, headline,
             board_id, sha256, storage_key, mime_type, width, height, byte_size, ai_modified,
             publish_at, state, created_at)
           VALUES (?, 'd1', 'm1', 'Tulip', '', '', '', '11', 'h', 'k', 'image/png', 1000, 1500,
             1, 0, 't', ?, 't')`,
        )
        .run(id, state);
    insertPin('p1', 'planned');
    expect(() => insertPin('p0', 'publishing')).toThrow(/CHECK/);

    migrate(connection, CATALOG_MIGRATIONS);

    expect(connection.prepare('SELECT id, failure_code FROM pins').all()).toEqual([
      { id: 'p1', failure_code: null },
    ]);
    insertPin('p2', 'publishing');
    expect(
      connection.prepare("SELECT COUNT(*) AS n FROM pins WHERE state = 'publishing'").get(),
    ).toEqual({ n: 1 });
  });

  it('keeps concepts and their designs through the rebuild that allows unnamed ones', () => {
    insertDesign('d1', '01-mug', 'c1', 'mug');
    connection.exec(
      `INSERT INTO concepts (id, key, name, created_at) VALUES ('c5', '05', '05', 't')`,
    );

    migrate(connection, CATALOG_MIGRATIONS);

    // A flat file's concept was named after its key; it becomes unnamed.
    expect(connection.prepare('SELECT id, name FROM concepts ORDER BY id').all()).toEqual([
      { id: 'c1', name: 'Tulip' },
      { id: 'c2', name: 'Winter' },
      { id: 'c5', name: null },
    ]);
    connection.exec(
      `INSERT INTO concepts (id, key, name, created_at) VALUES ('c3', '03', NULL, 't')`,
    );
    insertDesign('d3', '03-mug', 'c3', 'mug');
    expect(() => {
      insertDesign('d4', '04-mug', 'missing', 'mug');
    }).toThrow(/FOREIGN KEY/);
    expect(connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('keeps one batch job whose designs go with it and stop at unknown states', () => {
    migrate(connection, CATALOG_MIGRATIONS);
    const insertJob = (id: string, state: string) =>
      connection
        .prepare(
          `INSERT INTO batch_jobs (id, state, steps_json, market, created_at)
           VALUES (?, ?, '["print"]', 'US', 't')`,
        )
        .run(id, state);
    const insertItem = (jobId: string, position: number, designId: string) =>
      connection
        .prepare(
          `INSERT INTO batch_items (job_id, position, design_id, design_key, design_revision,
             steps_json)
           VALUES (?, ?, ?, '01-mug', 1, '{}')`,
        )
        .run(jobId, position, designId);

    insertJob('j1', 'running');
    insertItem('j1', 0, 'd1');
    expect(() => insertJob('j2', 'lost')).toThrow(/CHECK/);
    expect(() => insertItem('j1', 0, 'd2')).toThrow(/UNIQUE/);
    expect(() => insertItem('missing', 1, 'd2')).toThrow(/FOREIGN KEY/);

    connection.exec("DELETE FROM batch_jobs WHERE id = 'j1'");
    expect(connection.prepare('SELECT COUNT(*) AS n FROM batch_items').get()).toEqual({ n: 0 });
  });
});
