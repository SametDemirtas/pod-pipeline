import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportSourceUnreadableError, ValidationError } from '../errors.js';
import { IMPORT_ROOT as ROOT, ImportFixture } from '../testing/import-fixture.js';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../catalog/image-limits.js';
import type { ImportProgress } from './import-preview.js';

describe('PreviewImport', () => {
  let fixture: ImportFixture;

  beforeEach(() => {
    fixture = new ImportFixture();
  });

  it('lists new designs with image details and skipped files', async () => {
    const plan = await fixture.preview.execute(ROOT);

    expect(plan.rootPath).toBe(ROOT);
    expect(plan.counts).toEqual({ new: 3, changed: 0, unchanged: 0, skipped: 1 });
    expect(plan.items.map((item) => [item.designKey, item.status])).toEqual([
      ['01-blanket', 'new'],
      ['01-mug', 'new'],
      ['02-mug', 'new'],
    ]);
    expect(plan.items[1]).toEqual({
      designKey: '01-mug',
      conceptKey: '01',
      conceptName: 'Lantern Harbor',
      familyId: 'mug',
      relativePath: '01. Lantern Harbor/Kupa.png',
      absolutePath: `${ROOT}/01. Lantern Harbor/Kupa.png`,
      byteSize: 'tulip-mug'.length,
      mimeType: 'image/png',
      width: 3840,
      height: 1648,
      sha256: await fixture.folder.hashText('tulip-mug'),
      status: 'new',
      currentRevision: null,
      borrowed: false,
    });
    expect(plan.concepts).toEqual([
      { conceptKey: '01', name: 'Lantern Harbor' },
      { conceptKey: '02', name: 'Frost Garden' },
    ]);
    expect(plan.skipped).toEqual([{ relativePath: 'readme.txt', reason: 'unsupported-extension' }]);
    expect(plan.conceptRenames).toEqual([]);
  });

  it('does not write anything', async () => {
    await fixture.preview.execute(ROOT);

    expect(fixture.assets.stored).toEqual([]);
    expect(await fixture.designKeys()).toEqual([]);
  });

  it('names a concept after the first of its files that gives a name', async () => {
    fixture.folder.write({ relativePath: '01-phone-case.png', content: 'flat-case' });
    fixture.folder.write({ relativePath: '03-blanket.png', content: 'flat-blanket' });

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.concepts).toEqual([
      { conceptKey: '01', name: 'Lantern Harbor' },
      { conceptKey: '02', name: 'Frost Garden' },
      { conceptKey: '03', name: null },
    ]);
  });

  it('skips files that are not images or cannot be read', async () => {
    fixture.folder.write({ relativePath: '03. Broken/Mug.png', content: 'x', image: null });
    fixture.folder.write({ relativePath: '04. Locked/Mug.png', content: 'y', unreadable: true });
    fixture.folder.write({ relativePath: '05. Huge/Mug.png', content: 'z', image: 'too-large' });
    fixture.folder.write({ relativePath: '06. Cases/Phone Case.png', content: 'c', image: null });

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.items.map((item) => item.designKey)).toEqual(['01-blanket', '01-mug', '02-mug']);
    expect(plan.skipped).toEqual([
      { relativePath: '03. Broken/Mug.png', reason: 'not-an-image' },
      { relativePath: '04. Locked/Mug.png', reason: 'unreadable' },
      { relativePath: '05. Huge/Mug.png', reason: 'image-too-large' },
      { relativePath: '06. Cases/Phone Case.png', reason: 'not-an-image' },
      { relativePath: 'readme.txt', reason: 'unsupported-extension' },
    ]);
    expect(plan.counts.skipped).toBe(5);
  });

  it('makes Samsung cases from phone case files only while the seller lets it', async () => {
    fixture.folder.write({ relativePath: '06. Cases/Phone Case.png', content: 'case' });

    const shared = await fixture.preview.execute(ROOT);
    expect(
      shared.items
        .filter((item) => item.conceptKey === '06')
        .map((item) => [item.designKey, item.borrowed]),
    ).toEqual([
      ['06-phone-case', false],
      ['06-samsung-case', true],
    ]);

    fixture.shareArtwork = false;
    const own = await fixture.preview.execute(ROOT);
    expect(own.items.map((item) => item.designKey)).not.toContain('06-samsung-case');
  });

  it('reads a file two designs are made from once', async () => {
    fixture.folder.write({ relativePath: '06. Cases/Phone Case.png', content: 'case' });
    const read: string[] = [];
    const hashFile = fixture.folder.hashFile.bind(fixture.folder);
    fixture.folder.hashFile = (absolutePath) => {
      read.push(absolutePath);
      return hashFile(absolutePath);
    };

    const plan = await fixture.preview.execute(ROOT);

    const cases = plan.items.filter((item) => item.conceptKey === '06');
    expect(cases.map((item) => item.sha256)).toEqual([cases[0]?.sha256, cases[0]?.sha256]);
    expect(read.filter((path) => path.endsWith('Phone Case.png'))).toHaveLength(1);
  });

  it('skips images too large to decode safely', async () => {
    const huge = (width: number, height: number) => ({
      mimeType: 'image/png' as const,
      width,
      height,
    });
    fixture.folder.write({
      relativePath: '03. Wide/Mug.png',
      content: 'w',
      image: huge(MAX_IMAGE_SIDE + 1, 10),
    });
    fixture.folder.write({
      relativePath: '04. Square/Mug.png',
      content: 's',
      image: huge(20_001, 20_000),
    });
    fixture.folder.write({
      relativePath: '05. Largest/Mug.png',
      content: 'l',
      image: huge(MAX_IMAGE_SIDE, MAX_IMAGE_PIXELS / MAX_IMAGE_SIDE),
    });

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.items.map((item) => item.designKey)).toContain('05-mug');
    expect(plan.skipped).toEqual([
      { relativePath: '03. Wide/Mug.png', reason: 'image-too-large' },
      { relativePath: '04. Square/Mug.png', reason: 'image-too-large' },
      { relativePath: 'readme.txt', reason: 'unsupported-extension' },
    ]);
  });

  it('lists folders the scanner could not read or did not enter', async () => {
    fixture.folder.write({ relativePath: '05. Nested/old/Mug.png', content: 'old' });
    fixture.folder.write({ relativePath: '06. Private/Mug.png', content: 'private' });
    fixture.folder.lockedFolders.add('06. Private');

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.skipped).toEqual([
      { relativePath: '05. Nested/old', reason: 'too-deep' },
      { relativePath: '06. Private', reason: 'unreadable' },
      { relativePath: 'readme.txt', reason: 'unsupported-extension' },
    ]);
  });

  it('reports reading progress for every planned design', async () => {
    const onProgress = vi.fn<(progress: ImportProgress) => void>();

    await fixture.preview.execute(ROOT, onProgress);

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { phase: 'reading', done: 0, total: 3 },
      { phase: 'reading', done: 1, total: 3 },
      { phase: 'reading', done: 2, total: 3 },
      { phase: 'reading', done: 3, total: 3 },
    ]);
  });

  it('marks designs as unchanged or changed after an import', async () => {
    await fixture.importAll();
    fixture.folder.write({ relativePath: '02. Frost Garden/Mug.png', content: 'frost-v2' });

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.items.map((item) => [item.designKey, item.status, item.currentRevision])).toEqual([
      ['01-blanket', 'unchanged', 1],
      ['01-mug', 'unchanged', 1],
      ['02-mug', 'changed', 1],
    ]);
    expect(plan.counts).toEqual({ new: 0, changed: 1, unchanged: 2, skipped: 1 });
  });

  it('treats artwork made larger in the app as unchanged until its source file changes', async () => {
    await fixture.importAll();
    const blanket = await fixture.catalog.designs.findByKey('01-blanket');
    if (!blanket) throw new Error('blanket missing');
    await fixture.catalog.designs.save({
      ...blanket,
      revision: 2,
      asset: { ...blanket.asset, sha256: 'sha-larger', storageKey: 'assets/sha-larger' },
      upscale: { model: 'illustration', originalSha256: blanket.asset.sha256 },
    });

    const unchanged = await fixture.preview.execute(ROOT);
    fixture.folder.write({
      relativePath: '01. Lantern Harbor/Battaniye.png',
      content: 'tulip-v2',
    });
    const changed = await fixture.preview.execute(ROOT);

    expect(unchanged.items[0]).toMatchObject({ designKey: '01-blanket', status: 'unchanged' });
    expect(changed.items[0]).toMatchObject({ designKey: '01-blanket', status: 'changed' });
  });

  it('detects renamed concepts but not files without a name', async () => {
    await fixture.importAll();
    fixture.folder.remove('02. Frost Garden/Mug.png');
    fixture.folder.write({ relativePath: '02. Snowy Garden/Mug.png', content: 'frost-mug' });
    fixture.folder.write({ relativePath: '01-phone-case.png', content: 'tulip-case' });

    const plan = await fixture.preview.execute(ROOT);

    expect(plan.conceptRenames).toEqual([
      { conceptKey: '02', from: 'Frost Garden', to: 'Snowy Garden' },
    ]);
  });

  it('gives the same fingerprint for the same folder and a new one after any change', async () => {
    const first = await fixture.preview.execute(ROOT);
    const second = await fixture.preview.execute(ROOT);
    fixture.folder.write({ relativePath: '01. Lantern Harbor/Kupa.png', content: 'edited' });
    const third = await fixture.preview.execute(ROOT);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(third.fingerprint).not.toBe(first.fingerprint);
  });

  it('rejects a blank folder path but keeps meaningful spaces', async () => {
    await expect(fixture.preview.execute('   ')).rejects.toBeInstanceOf(ValidationError);
    await expect(fixture.preview.execute(`${ROOT} `)).rejects.toBeInstanceOf(
      ImportSourceUnreadableError,
    );
  });

  it('reports a folder that cannot be read', async () => {
    const cause = new Error('EACCES');
    fixture.folder.scanError = cause;

    await expect(fixture.preview.execute(ROOT)).rejects.toMatchObject({
      constructor: ImportSourceUnreadableError,
      details: { rootPath: ROOT, cause: 'EACCES' },
      cause,
    });
  });
});
