import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrations.js';
import { CATALOG_MIGRATIONS } from './schema.js';

let connection: DatabaseSync;

beforeEach(() => {
  connection = new DatabaseSync(':memory:');
  connection.exec('PRAGMA foreign_keys = ON');
  migrate(connection, CATALOG_MIGRATIONS.slice(0, 20));
  connection.exec(`
    INSERT INTO concepts (id, key, name, created_at) VALUES ('c1', '01', 'Tulip', 't');
    INSERT INTO designs (id, design_key, concept_id, family_id, revision, sha256, storage_key,
      mime_type, width, height, byte_size, source_path, created_at, updated_at)
    VALUES ('d1', '01-mug', 'c1', 'mug', 1, 'h', 'k', 'image/png', 1, 1, 1, 'p', 't', 't');
    INSERT INTO batch_jobs (id, state, steps_json, market, created_at)
    VALUES ('j1', 'finished', '["draft"]', 'US', 't');
  `);
});

afterEach(() => {
  connection.close();
});

const unconfirmed = JSON.stringify({ step: 'draft', code: 'ETSY_DRAFT_UNCONFIRMED' });
const other = JSON.stringify({ step: 'text', code: 'PROVIDER_FAILED' });

describe('service-neutral names', () => {
  it("keeps a published pin's id under its new column", () => {
    connection.exec(`
      INSERT INTO pins (id, design_id, mockup_id, title, description, alt_text, headline,
        board_id, sha256, storage_key, mime_type, width, height, byte_size, ai_modified,
        publish_at, state, pinterest_id, created_at)
      VALUES ('p1', 'd1', 'm1', 'Tulip', '', '', '', '11', 'h', 'k', 'image/png', 1000, 1500,
        1, 0, 't', 'published', '9', 't');
    `);

    migrate(connection, CATALOG_MIGRATIONS);

    expect(connection.prepare('SELECT id, published_id FROM pins').all()).toEqual([
      { id: 'p1', published_id: '9' },
    ]);
  });

  it('renames the code of an unconfirmed draft in stored failures and checks only', () => {
    const insertItem = connection.prepare(
      `INSERT INTO batch_items (job_id, position, design_id, design_key, design_revision,
         steps_json, failure_json, draft_check_json)
       VALUES ('j1', ?, ?, '01-mug', 1, '{}', ?, ?)`,
    );
    insertItem.run(0, 'd1', unconfirmed, unconfirmed);
    insertItem.run(1, 'd2', other, null);
    connection
      .prepare('INSERT INTO batch_draft_checks (design_id, failure_json) VALUES (?, ?)')
      .run('d1', unconfirmed);

    migrate(connection, CATALOG_MIGRATIONS);

    const codes = connection
      .prepare(
        `SELECT json_extract(failure_json, '$.code') AS failure,
                json_extract(draft_check_json, '$.code') AS draftCheck
           FROM batch_items ORDER BY position`,
      )
      .all();
    expect(codes).toEqual([
      { failure: 'DRAFT_UNCONFIRMED', draftCheck: 'DRAFT_UNCONFIRMED' },
      { failure: 'PROVIDER_FAILED', draftCheck: null },
    ]);
    expect(
      connection.prepare('SELECT failure_json FROM batch_draft_checks').get()?.['failure_json'],
    ).toBe(JSON.stringify({ step: 'draft', code: 'DRAFT_UNCONFIRMED' }));
  });
});

describe('badge codes', () => {
  it('turns the English badge names of stored research runs into codes', () => {
    const report = {
      query: 'meadow bees mug',
      listings: [
        { listingId: '1', badges: ['Bestseller', 'Etsy’s Pick'] },
        { listingId: '2', badges: [] },
        { listingId: '3', badges: ["Etsy's Pick", 'Popular now', 'popularNow', 'Other'] },
      ],
    };
    connection
      .prepare(
        `INSERT INTO research_runs (id, query, market, created_at, report_json)
         VALUES ('r1', 'meadow bees mug', 'US', 't', ?)`,
      )
      .run(JSON.stringify(report));

    migrate(connection, CATALOG_MIGRATIONS);

    const stored = connection.prepare('SELECT report_json FROM research_runs').get();
    expect(JSON.parse(String(stored?.['report_json']))).toEqual({
      query: 'meadow bees mug',
      listings: [
        { listingId: '1', badges: ['bestseller', 'marketPick'] },
        { listingId: '2', badges: [] },
        { listingId: '3', badges: ['marketPick', 'popularNow', 'popularNow', 'Other'] },
      ],
    });
  });
});

describe('marketplace-neutral research fields', () => {
  it('renames the top-seller fields and the pick badge of stored research runs', () => {
    const report = {
      query: 'meadow bees mug',
      adShare: 0.5,
      starSellerShare: 0.25,
      listings: [
        { listingId: '1', isAd: true, isStarSeller: true, badges: ['Etsy’s Pick', 'Bestseller'] },
        { listingId: '2', isAd: false, isStarSeller: false, badges: [] },
      ],
    };
    connection
      .prepare(
        `INSERT INTO research_runs (id, query, market, created_at, report_json)
         VALUES ('r1', 'meadow bees mug', 'US', 't', ?)`,
      )
      .run(JSON.stringify(report));

    migrate(connection, CATALOG_MIGRATIONS);

    const stored = connection.prepare('SELECT report_json FROM research_runs').get();
    expect(JSON.parse(String(stored?.['report_json']))).toEqual({
      query: 'meadow bees mug',
      adShare: 0.5,
      topSellerShare: 0.25,
      listings: [
        { listingId: '1', isAd: true, isTopSeller: true, badges: ['marketPick', 'bestseller'] },
        { listingId: '2', isAd: false, isTopSeller: false, badges: [] },
      ],
    });
  });

  it('leaves a run already in the new names as it was', () => {
    migrate(connection, CATALOG_MIGRATIONS.slice(0, 22));
    const report = {
      topSellerShare: 1,
      listings: [{ listingId: '1', isTopSeller: true, badges: ['marketPick'] }],
    };
    connection
      .prepare(
        `INSERT INTO research_runs (id, query, market, created_at, report_json)
         VALUES ('r1', 'q', 'US', 't', ?)`,
      )
      .run(JSON.stringify(report));

    migrate(connection, CATALOG_MIGRATIONS);

    const stored = connection.prepare('SELECT report_json FROM research_runs').get();
    expect(JSON.parse(String(stored?.['report_json']))).toEqual(report);
  });
});
