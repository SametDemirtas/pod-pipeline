import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { MockupId, ResearchRunId } from '@pod/core';
import {
  conceptKeyOf,
  describeBatchContract,
  describeDraftCheckContract,
  describeCatalogContract,
  describeKeywordListContract,
  describeMockupContract,
  describePinContract,
  samplePin,
  describeResearchContract,
  describeShopListingContract,
  sampleConcept,
  sampleDesign,
} from '@pod/core/testing/contract';
import { SqliteBatchRepository } from './sqlite-batch-repository.js';
import { SqliteDatabase } from './database.js';
import { SqliteDraftChecks } from './sqlite-draft-checks.js';
import { migrate } from './migrations.js';
import { CATALOG_MIGRATIONS } from './schema.js';
import { SqliteCatalog } from './sqlite-catalog.js';
import { SqliteAssetReferences } from './sqlite-asset-references.js';
import { SqliteListingRepository } from './sqlite-listing-repository.js';
import { SqlitePinRepository } from './sqlite-pin-repository.js';
import { SqliteKeywordLists } from './sqlite-keyword-lists.js';
import { SqliteResearchRepository } from './sqlite-research-repository.js';
import { SqliteMockupRepository } from './sqlite-mockup-repository.js';

const opened: SqliteDatabase[] = [];
const folders: string[] = [];

function openCatalog(location = ':memory:') {
  const db = SqliteDatabase.open(location);
  opened.push(db);
  return { db, catalog: new SqliteCatalog(db) };
}

function temporaryFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pod-sqlite-'));
  folders.push(dir);
  return join(dir, 'catalog.db');
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.close().catch(() => undefined);
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describeCatalogContract('SQLite', () => {
  const { catalog } = openCatalog();
  return {
    concepts: catalog.concepts,
    designs: catalog.designs,
    query: catalog.query,
    unitOfWork: catalog,
  };
});

describeMockupContract('SQLite', () => {
  const { db, catalog } = openCatalog();
  return { catalog, mockups: new SqliteMockupRepository(db) };
});

describeShopListingContract('SQLite', () => {
  const { db, catalog } = openCatalog();
  return { catalog, listings: new SqliteListingRepository(db) };
});

describeResearchContract('SQLite', () => new SqliteResearchRepository(openCatalog().db));
describeKeywordListContract('SQLite', () => new SqliteKeywordLists(openCatalog().db));
describeBatchContract('SQLite', () => new SqliteBatchRepository(openCatalog().db));
describeDraftCheckContract('SQLite', () => {
  const { db, catalog } = openCatalog();
  return { catalog, checks: new SqliteDraftChecks(db) };
});

describePinContract('SQLite', () => {
  const { db, catalog } = openCatalog();
  return { catalog, pins: new SqlitePinRepository(db) };
});

describe('SQLite catalog', () => {
  it('keeps data after the database is reopened', async () => {
    const file = temporaryFile();
    const first = openCatalog(file);
    await first.catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
    await first.catalog.designs.save(sampleDesign('01-mug'));
    await first.db.close();

    const second = openCatalog(file);
    const details = await second.catalog.query.getDesign(sampleDesign('01-mug').id);

    expect(details?.design).toEqual({
      ...sampleDesign('01-mug'),
      concept: sampleConcept('01', 'Lantern Harbor'),
    });
  });

  it('drops research runs from before markets', async () => {
    const file = temporaryFile();
    const old = new DatabaseSync(file);
    migrate(old, CATALOG_MIGRATIONS.slice(0, 11));
    old
      .prepare(
        `INSERT INTO research_runs (id, query, created_at, report_json)
         VALUES ('r0', 'tulip mug', '2026-10-20T10:00:00.000Z', '{}')`,
      )
      .run();
    old.close();

    const runs = new SqliteResearchRepository(openCatalog(file).db);

    expect(await runs.list(5)).toEqual([]);
  });

  it('refuses a research run stored with a market it does not know', async () => {
    const { db } = openCatalog();
    await db.exclusive(() => {
      db.prepare(
        `INSERT INTO research_runs (id, query, market, created_at, report_json)
         VALUES ('r1', 'q', 'FR', '2026-10-26T10:00:00.000Z', '{}')`,
      ).run();
      return Promise.resolve();
    });

    await expect(new SqliteResearchRepository(db).get('r1' as ResearchRunId)).rejects.toThrow(
      /Unknown stored market FR/,
    );
  });

  it('only runs statements while the lock is held', async () => {
    const { db } = openCatalog();

    expect(() => db.prepare('SELECT 1')).toThrow(/lock is not held/);
    expect(() => db.atomically(() => 1)).toThrow(/lock is not held/);
    await expect(
      db.exclusive(() => Promise.resolve(db.prepare('SELECT 1').get())),
    ).resolves.toEqual({ 1: 1 });
  });

  it('refuses to close from inside a transaction', async () => {
    const { db, catalog } = openCatalog();

    await expect(catalog.run(() => db.close())).rejects.toThrow(/inside another catalog operation/);
    await catalog.concepts.save(sampleConcept('01'));
    expect(await catalog.concepts.findByKey('01')).toEqual(sampleConcept('01'));
  });

  it('keeps the commit error when a deferred constraint fails', async () => {
    const { db, catalog } = openCatalog();

    await expect(
      db.transaction(() => {
        db.prepare('PRAGMA defer_foreign_keys = ON').run();
        db.prepare(
          `INSERT INTO designs (id, design_key, concept_id, family_id, revision, sha256,
             storage_key, mime_type, width, height, byte_size, source_path, created_at, updated_at)
           VALUES ('d', '01-mug', 'missing', 'mug', 1, 's', 'k', 'image/png', 1, 1, 1, 'p', 't', 't')`,
        ).run();
        return Promise.resolve();
      }),
    ).rejects.toThrow(/FOREIGN KEY/);

    await catalog.concepts.save(sampleConcept('01'));
    expect(await catalog.concepts.findByKey('01')).toEqual(sampleConcept('01'));
    expect(await catalog.designs.findByKey('01-mug')).toBeUndefined();
  });

  it('waits for running work before closing', async () => {
    const { db, catalog } = openCatalog();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const transaction = catalog.run(async (tx) => {
      await gate;
      await tx.concepts.save(sampleConcept('01'));
    });
    const closing = db.close();
    release();

    await expect(transaction).resolves.toBeUndefined();
    await expect(closing).resolves.toBeUndefined();
    await expect(catalog.concepts.findByKey('01')).rejects.toThrow(/not open/);
  });

  it('closes the file when it was written by a newer release', async () => {
    const file = temporaryFile();
    const newer = SqliteDatabase.open(file, [
      ...CATALOG_MIGRATIONS,
      {
        version: CATALOG_MIGRATIONS.length + 1,
        name: 'future',
        sql: 'CREATE TABLE future (id INTEGER)',
      },
    ]);
    await newer.close();

    expect(() => SqliteDatabase.open(file)).toThrow(
      `schema version ${CATALOG_MIGRATIONS.length + 1}`,
    );
    expect(() => {
      rmSync(file);
    }).not.toThrow();
  });

  it('orders more than a hundred concepts numerically across pages', async () => {
    const { catalog } = openCatalog();
    const keys = Array.from(
      { length: 120 },
      (_, index) => `${String(index + 1).padStart(2, '0')}-mug`,
    );
    for (const key of [...keys].reverse()) {
      await catalog.concepts.save(sampleConcept(conceptKeyOf(key)));
      await catalog.designs.save(sampleDesign(key));
    }

    const listed: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await catalog.query.listDesigns({}, { limit: 25, cursor });
      listed.push(...page.items.map((item) => item.designKey));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(listed).toEqual(keys);
  });
});

describe('SQLite asset references', () => {
  it('lists the files of designs, earlier revisions, mockups, their sources and pins once each', async () => {
    const { db, catalog } = openCatalog();
    const references = new SqliteAssetReferences(db);
    expect(await references.referencedKeys()).toEqual(new Set());

    await catalog.concepts.save(sampleConcept('01'));
    const first = sampleDesign('01-mug');
    await catalog.designs.save(first);
    await catalog.designs.save({
      ...first,
      revision: 2,
      asset: { ...first.asset, storageKey: 'assets/second', sha256: 'second' },
    });
    await new SqliteMockupRepository(db).replace(
      first.id,
      { variantId: '1320', printArea: 'default' },
      [
        {
          id: 'm1' as MockupId,
          designId: first.id,
          designRevision: 2,
          variantId: '1320',
          printArea: 'default',
          view: 'Front',
          scenePrompt: 'on a table',
          sceneCheck: null,
          printConfirmed: false,
          // A replaced source photo stays, so the scene can still be checked against it.
          sourceAsset: { ...first.asset, storageKey: 'assets/source' },
          asset: { ...first.asset, storageKey: 'assets/photo' },
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ],
    );

    await new SqlitePinRepository(db).save(samplePin('p1', first.id, 0));

    expect(await references.referencedKeys()).toEqual(
      new Set([
        first.asset.storageKey,
        'assets/second',
        'assets/photo',
        'assets/source',
        'pins/p1',
      ]),
    );
  });
});
