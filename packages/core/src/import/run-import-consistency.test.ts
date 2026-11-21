import { beforeEach, describe, expect, it } from 'vitest';
import type { ConceptId } from '../catalog/model.js';
import { ConflictError, ImportPlanChangedError } from '../errors.js';
import type { CatalogWriter, UnitOfWork } from '../ports/catalog-repositories.js';
import { IMPORT_ROOT as ROOT, ImportFixture } from '../testing/import-fixture.js';

/** A unit of work where another writer changes the catalog just before the import's work. */
function changedFirst(fixture: ImportFixture, change: (tx: CatalogWriter) => Promise<void>) {
  const unitOfWork: UnitOfWork = {
    run: (work) =>
      fixture.catalog.run(async (tx) => {
        await change(tx);
        return work(tx);
      }),
  };
  return fixture.createRunImport({ unitOfWork });
}

async function renameConcept(tx: CatalogWriter, key: string, name: string): Promise<void> {
  const concept = await tx.concepts.findByKey(key);
  if (concept) await tx.concepts.save({ ...concept, name });
}

describe('RunImport consistency', () => {
  let fixture: ImportFixture;

  beforeEach(() => {
    fixture = new ImportFixture();
  });

  it('lets only one of two simultaneous imports of the same preview succeed', async () => {
    const plan = await fixture.preview.execute(ROOT);
    const input = { rootPath: ROOT, fingerprint: plan.fingerprint };

    const results = await Promise.allSettled([
      fixture.runImport.execute(input),
      fixture.createRunImport().execute(input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ImportPlanChangedError);
    expect(await fixture.revisionsOf('01-mug')).toEqual([1]);
  });

  it('refuses to run when the catalog changed after the preview', async () => {
    const plan = await fixture.preview.execute(ROOT);
    await fixture.importAll();

    await expect(
      fixture.runImport.execute({ rootPath: ROOT, fingerprint: plan.fingerprint }),
    ).rejects.toBeInstanceOf(ImportPlanChangedError);
  });

  it('rolls back a concept renamed by someone else before the import wrote', async () => {
    await fixture.importAll();
    fixture.folder.write({ relativePath: '01. Lantern Harbor/Kupa.png', content: 'mug-v2' });

    const runImport = changedFirst(fixture, (tx) => renameConcept(tx, '01', 'Renamed'));

    await expect(fixture.importAll(runImport)).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect((await fixture.catalog.concepts.findByKey('01'))?.name).toBe('Lantern Harbor');
    expect(await fixture.revisionsOf('01-mug')).toEqual([1]);
  });

  it('refuses when someone else created the concept under another name', async () => {
    const runImport = changedFirst(fixture, (tx) =>
      tx.concepts.save({
        id: 'theirs' as ConceptId,
        key: '01',
        name: 'Their concept',
        createdAt: new Date(),
      }),
    );

    await expect(fixture.importAll(runImport)).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect(await fixture.catalog.concepts.findByKey('01')).toBeUndefined();
  });

  it('imports into a concept someone else created with the same name', async () => {
    const runImport = changedFirst(fixture, (tx) =>
      tx.concepts.save({
        id: 'theirs' as ConceptId,
        key: '01',
        name: 'Lantern Harbor',
        createdAt: new Date(),
      }),
    );

    await fixture.importAll(runImport);

    expect((await fixture.catalog.designs.findByKey('01-mug'))?.conceptId).toBe('theirs');
  });

  it('refuses a rename someone else already applied', async () => {
    await fixture.importAll();
    fixture.folder.remove('02. Frost Garden/Mug.png');
    fixture.folder.write({ relativePath: '02. Snowy Garden/Mug.png', content: 'frost-mug' });

    const runImport = changedFirst(fixture, (tx) => renameConcept(tx, '02', 'Snowy Garden'));

    await expect(fixture.importAll(runImport)).rejects.toBeInstanceOf(ImportPlanChangedError);
  });

  it('refuses a preview that expects concepts the catalog no longer has', async () => {
    await fixture.importAll();
    fixture.folder.write({ relativePath: '02. Frost Garden/Mug.png', content: 'frost-v2' });
    const stale = await fixture.preview.execute(ROOT);
    const empty = new ImportFixture();
    empty.folder.write({ relativePath: '02. Frost Garden/Mug.png', content: 'frost-v2' });
    const runImport = empty.createRunImport({ planner: { execute: () => Promise.resolve(stale) } });

    await expect(
      runImport.execute({ rootPath: ROOT, fingerprint: stale.fingerprint }),
    ).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect(await empty.designKeys()).toEqual([]);
  });

  it('rolls back every write when saving a later design fails', async () => {
    let saves = 0;
    const unitOfWork: UnitOfWork = {
      run: (work) =>
        fixture.catalog.run((tx) =>
          work({
            concepts: tx.concepts,
            designs: {
              findByKey: (key) => tx.designs.findByKey(key),
              save: (design) => {
                saves += 1;
                return saves === 2
                  ? Promise.reject(new ConflictError('simulated'))
                  : tx.designs.save(design);
              },
              keepOrientation: (id, kept) => tx.designs.keepOrientation(id, kept),
            },
          }),
        ),
    };

    await expect(fixture.importAll(fixture.createRunImport({ unitOfWork }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await fixture.designKeys()).toEqual([]);
    expect(await fixture.catalog.concepts.findByKey('01')).toBeUndefined();
  });
});
