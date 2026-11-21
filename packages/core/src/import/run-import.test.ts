import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportNothingToDoError, ImportPlanChangedError, ValidationError } from '../errors.js';
import { IMPORT_ROOT as ROOT, ImportFixture } from '../testing/import-fixture.js';
import type { ImportProgress } from './import-preview.js';

describe('RunImport', () => {
  let fixture: ImportFixture;

  beforeEach(() => {
    fixture = new ImportFixture();
  });

  it('stores files and creates concepts and designs', async () => {
    const result = await fixture.importAll();

    expect(result).toEqual({
      created: ['01-blanket', '01-mug', '02-mug'],
      updated: [],
      unchanged: 0,
      skipped: 1,
      renamedConceptKeys: [],
    });
    expect(fixture.assets.stored.map((entry) => entry.mimeType)).toEqual([
      'image/png',
      'image/png',
      'image/png',
    ]);
    const sha256 = await fixture.folder.hashText('tulip-mug');
    expect(await fixture.catalog.designs.findByKey('01-mug')).toEqual({
      id: expect.any(String) as string,
      designKey: '01-mug',
      conceptId: (await fixture.catalog.concepts.findByKey('01'))?.id,
      familyId: 'mug',
      revision: 1,
      asset: {
        sha256,
        storageKey: `assets/${sha256}`,
        mimeType: 'image/png',
        width: 3840,
        height: 1648,
        byteSize: 'tulip-mug'.length,
      },
      sourcePath: `${ROOT}/01. Lantern Harbor/Kupa.png`,
      createdAt: fixture.clock.now(),
      updatedAt: fixture.clock.now(),
    });
    expect((await fixture.catalog.concepts.findByKey('02'))?.name).toBe('Frost Garden');
  });

  it('reports copying progress after reading', async () => {
    const plan = await fixture.preview.execute(ROOT);
    const onProgress = vi.fn<(progress: ImportProgress) => void>();

    await fixture.runImport.execute({ rootPath: ROOT, fingerprint: plan.fingerprint }, onProgress);

    const phases = onProgress.mock.calls.map(([progress]) => progress);
    expect(phases[0]).toEqual({ phase: 'reading', done: 0, total: 3 });
    expect(phases.slice(-4)).toEqual([
      { phase: 'copying', done: 0, total: 3 },
      { phase: 'copying', done: 1, total: 3 },
      { phase: 'copying', done: 2, total: 3 },
      { phase: 'copying', done: 3, total: 3 },
    ]);
  });

  it('leaves a concept from flat files unnamed until a folder names it', async () => {
    fixture.folder.write({ relativePath: '05-blanket.png', content: 'flat' });
    await fixture.importAll();

    expect((await fixture.catalog.concepts.findByKey('05'))?.name).toBeNull();

    fixture.folder.write({ relativePath: '05. Night Owls/Mug.png', content: 'owl-mug' });
    const plan = await fixture.preview.execute(ROOT);
    expect(plan.conceptRenames).toEqual([{ conceptKey: '05', from: null, to: 'Night Owls' }]);
    await fixture.runImport.execute({ rootPath: ROOT, fingerprint: plan.fingerprint });

    expect((await fixture.catalog.concepts.findByKey('05'))?.name).toBe('Night Owls');
  });

  it('takes the folder name even when a flat file of the concept sorts first', async () => {
    fixture.folder.write({ relativePath: '01-phone-case.png', content: 'tulip-case' });

    await fixture.importAll();

    expect((await fixture.catalog.concepts.findByKey('01'))?.name).toBe('Lantern Harbor');
    const again = await fixture.preview.execute(ROOT);
    expect(again.conceptRenames).toEqual([]);
    expect(again.counts.unchanged).toBe(5);
  });

  it('keeps an existing concept name when only flat files are added', async () => {
    await fixture.importAll();
    fixture.folder.write({ relativePath: '01-phone-case.png', content: 'tulip-case' });

    const result = await fixture.importAll();

    expect(result.created).toEqual(['01-phone-case', '01-samsung-case']);
    expect(result.renamedConceptKeys).toEqual([]);
    expect((await fixture.catalog.concepts.findByKey('01'))?.name).toBe('Lantern Harbor');
  });

  it('refuses to import twice when nothing changed', async () => {
    await fixture.importAll();

    await expect(fixture.importAll()).rejects.toBeInstanceOf(ImportNothingToDoError);
  });

  it('stores a changed file as a new revision of the same design', async () => {
    await fixture.importAll();
    const original = await fixture.catalog.designs.findByKey('02-mug');
    fixture.clock.advance(60_000);
    fixture.folder.write({ relativePath: '02. Frost Garden/Mug.png', content: 'frost-v2' });

    const result = await fixture.importAll();

    expect(result).toEqual({
      created: [],
      updated: ['02-mug'],
      unchanged: 2,
      skipped: 1,
      renamedConceptKeys: [],
    });
    const current = await fixture.catalog.designs.findByKey('02-mug');
    expect(current?.id).toBe(original?.id);
    expect(current?.revision).toBe(2);
    expect(current?.createdAt).toEqual(original?.createdAt);
    expect(current?.updatedAt).toEqual(fixture.clock.now());
    expect(await fixture.revisionsOf('02-mug')).toEqual([2, 1]);
  });

  it('applies a concept rename even when no file changed', async () => {
    await fixture.importAll();
    fixture.folder.remove('02. Frost Garden/Mug.png');
    fixture.folder.write({ relativePath: '02. Snowy Garden/Mug.png', content: 'frost-mug' });

    const result = await fixture.importAll();

    expect(result.renamedConceptKeys).toEqual(['02']);
    expect(result.created).toEqual([]);
    expect((await fixture.catalog.concepts.findByKey('02'))?.name).toBe('Snowy Garden');
  });

  it('requires a fingerprint', async () => {
    await expect(
      fixture.runImport.execute({ rootPath: ROOT, fingerprint: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('writes nothing to the catalog when storing a file fails', async () => {
    fixture.assets.failWith = new Error('disk full');

    await expect(fixture.importAll()).rejects.toThrow('disk full');
    expect(await fixture.designKeys()).toEqual([]);
    expect(await fixture.catalog.concepts.findByKey('01')).toBeUndefined();
  });

  it('refuses a file that changed between hashing and copying', async () => {
    const plan = await fixture.preview.execute(ROOT);
    fixture.assets.contentOverride = 'edited while importing';

    await expect(
      fixture.runImport.execute({ rootPath: ROOT, fingerprint: plan.fingerprint }),
    ).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect(await fixture.designKeys()).toEqual([]);
  });

  it('refuses to run when the folder changed after the preview', async () => {
    const plan = await fixture.preview.execute(ROOT);
    fixture.folder.write({ relativePath: '03. New/Mug.png', content: 'new-mug' });

    await expect(
      fixture.runImport.execute({ rootPath: ROOT, fingerprint: plan.fingerprint }),
    ).rejects.toBeInstanceOf(ImportPlanChangedError);
    expect(fixture.assets.stored).toEqual([]);
  });
});
