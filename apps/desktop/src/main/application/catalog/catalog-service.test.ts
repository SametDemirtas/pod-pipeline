import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportProgressDto } from '@pod/contracts';
import {
  ConceptFolderLayout,
  DEFAULT_PRODUCT_FAMILIES,
  GetDesign,
  ListDesigns,
  NotFoundError,
  PreviewImport,
  ProductFamilyCatalog,
  RunImport,
} from '@pod/core';
import {
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  RecordingAssetStore,
  SequentialIds,
} from '@pod/core/testing';
import { ImportFolderNotApprovedError, ImportInProgressError } from '../errors/catalog-errors.js';
import { CatalogService } from './catalog-service.js';

const root = '/designs';

describe('CatalogService', () => {
  let progress: ImportProgressDto[];
  let catalogChanged: ReturnType<typeof vi.fn<() => void>>;
  let resolveApproved: ReturnType<typeof vi.fn<(rootPath: string) => Promise<string>>>;
  let folder: FakeSourceFolder;
  let service: CatalogService;

  beforeEach(() => {
    progress = [];
    catalogChanged = vi.fn<() => void>();
    resolveApproved = vi.fn<(rootPath: string) => Promise<string>>(() => Promise.resolve(root));
    folder = new FakeSourceFolder(root, [
      { relativePath: '01. Tulip/Mug.png', content: 'tulip' },
      { relativePath: '02-mug.png', content: 'flat' },
      { relativePath: 'notes.txt', content: 'x' },
    ]);
    const catalog = new InMemoryCatalog();
    const families = new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES);
    const previewImport = new PreviewImport({
      scanner: folder,
      layout: new ConceptFolderLayout(families),
      inspector: folder,
      hasher: folder,
      designs: catalog.designs,
      concepts: catalog.concepts,
      artwork: { shared: () => Promise.resolve(true) },
    });
    service = new CatalogService({
      families,
      listDesigns: new ListDesigns(catalog, families),
      getDesign: new GetDesign(catalog),
      previewImport,
      runImport: new RunImport({
        planner: previewImport,
        assets: new RecordingAssetStore(folder),
        unitOfWork: catalog,
        clock: new FixedClock(),
        ids: new SequentialIds(),
      }),
      folders: { resolveApproved },
      events: {
        importProgress: (event) => progress.push(event),
        catalogChanged,
      },
    });
  });

  async function importAll() {
    const preview = await service.previewImport({ rootPath: root });
    return service.runImport({ rootPath: root, fingerprint: preview.fingerprint });
  }

  it('lists product families', async () => {
    expect(await service.listFamilies()).toEqual(
      DEFAULT_PRODUCT_FAMILIES.map((family) => ({ id: family.id })),
    );
  });

  it('returns a preview without file system details', async () => {
    const preview = await service.previewImport({ rootPath: root });

    expect(preview.counts).toEqual({ new: 2, changed: 0, unchanged: 0, skipped: 1 });
    expect(preview.items[0]).toEqual({
      designKey: '01-mug',
      conceptKey: '01',
      conceptName: 'Tulip',
      familyId: 'mug',
      relativePath: '01. Tulip/Mug.png',
      width: 3840,
      height: 1648,
      byteSize: 5,
      status: 'new',
      currentRevision: null,
      borrowed: false,
    });
    expect(preview.items[1]?.conceptName).toBeNull();
    expect(preview.skipped).toEqual([
      { relativePath: 'notes.txt', reason: 'unsupported-extension' },
    ]);
    expect(progress.at(-1)).toEqual({ operation: 'preview', phase: 'reading', done: 2, total: 2 });
    expect(catalogChanged).not.toHaveBeenCalled();
  });

  it('imports, announces the change, then lists and describes designs', async () => {
    const result = await importAll();

    expect(result).toEqual({
      created: ['01-mug', '02-mug'],
      updated: [],
      unchanged: 0,
      skipped: 1,
      renamedConceptKeys: [],
    });
    expect(catalogChanged).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toEqual({ operation: 'import', phase: 'copying', done: 2, total: 2 });
    const page = await service.listDesigns({ limit: 1 });
    expect(page.total).toBe(2);
    expect(page.nextCursor).not.toBeNull();
    const [first] = page.items;
    expect(first).toMatchObject({
      designKey: '01-mug',
      familyId: 'mug',
      revision: 1,
      concept: { key: '01', name: 'Tulip' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const detail = await service.getDesign({ id: first?.id ?? '' });
    expect(detail.revisions).toEqual([
      {
        revision: 1,
        asset: first?.asset,
        sourcePath: `${root}/01. Tulip/Mug.png`,
        upscaleModel: null,
        rotation: null,
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('announces nothing when a repeated import has nothing to do', async () => {
    await importAll();

    await expect(importAll()).rejects.toMatchObject({ code: 'IMPORT_NOTHING_TO_DO' });
    expect(catalogChanged).toHaveBeenCalledTimes(1);
  });

  it('does not announce a change when the import fails', async () => {
    await expect(service.runImport({ rootPath: root, fingerprint: 'stale' })).rejects.toThrow();

    expect(catalogChanged).not.toHaveBeenCalled();
  });

  it('describes concept renames in the preview', async () => {
    await importAll();
    folder.remove('01. Tulip/Mug.png');
    folder.write({ relativePath: '01. Tulip Garden/Mug.png', content: 'tulip' });

    const preview = await service.previewImport({ rootPath: root });

    expect(preview.conceptRenames).toEqual([
      { conceptKey: '01', from: 'Tulip', to: 'Tulip Garden' },
    ]);
  });

  it('refuses folders that are not approved before touching them', async () => {
    resolveApproved.mockRejectedValue(new ImportFolderNotApprovedError('/elsewhere'));

    await expect(service.previewImport({ rootPath: '/elsewhere' })).rejects.toBeInstanceOf(
      ImportFolderNotApprovedError,
    );
    await expect(
      service.runImport({ rootPath: '/elsewhere', fingerprint: 'f' }),
    ).rejects.toBeInstanceOf(ImportFolderNotApprovedError);
    expect(resolveApproved.mock.calls).toEqual([['/elsewhere'], ['/elsewhere']]);
    expect(progress).toEqual([]);
  });

  it('reads and imports from the resolved folder, whatever path the client sent', async () => {
    const preview = await service.previewImport({ rootPath: '/link-to-designs' });
    const result = await service.runImport({
      rootPath: '/link-to-designs',
      fingerprint: preview.fingerprint,
    });

    expect(preview.rootPath).toBe(root);
    expect(result.created).toEqual(['01-mug', '02-mug']);
    expect(resolveApproved.mock.calls).toEqual([['/link-to-designs'], ['/link-to-designs']]);
  });

  it('passes domain errors through', async () => {
    await expect(service.getDesign({ id: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('runs one import operation at a time across preview and run', async () => {
    const preview = service.previewImport({ rootPath: root });

    await expect(service.previewImport({ rootPath: root })).rejects.toBeInstanceOf(
      ImportInProgressError,
    );
    await expect(service.runImport({ rootPath: root, fingerprint: 'f' })).rejects.toBeInstanceOf(
      ImportInProgressError,
    );
    await preview;
  });
});
