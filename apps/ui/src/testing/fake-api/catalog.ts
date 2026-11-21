import { vi } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  type DesignDetailDto,
  type DesktopApi,
  type ImportProgressDto,
  type ImportResultDto,
  type ListDesignsRequest,
  type UpscaleProgressDto,
} from '@pod/contracts/client';
import { previewDto } from '../dtos/catalog-dtos.js';
import type { FakeState } from './fake-state.js';
import { notifyCatalogChanged } from './fake-state.js';

/** Designs, imports, folders and upscaling. */
export function fakeCatalogApi(state: FakeState) {
  const getDesign = vi.fn(({ id }: { id: string }) => designDetail(state, id));
  return {
    listFamilies: vi.fn(() =>
      Promise.resolve([{ id: 'phone-case' }, { id: 'mug' }, { id: 'blanket' }]),
    ),
    listDesigns: vi.fn((request: ListDesignsRequest) =>
      Promise.resolve(designPage(state, request)),
    ),
    getDesign,
    previewImport: vi.fn(() => Promise.resolve(previewDto())),
    runImport: vi.fn((): Promise<ImportResultDto> => {
      notifyCatalogChanged(state);
      return Promise.resolve({
        created: ['01-mug'],
        updated: [],
        unchanged: 0,
        skipped: 1,
        renamedConceptKeys: [],
      });
    }),
    listImportFolders: vi.fn(() => Promise.resolve(state.importFolders)),
    removeImportFolder: vi.fn(({ folder }: { folder: string }) => {
      state.importFolders = state.importFolders.filter((candidate) => candidate !== folder);
      return Promise.resolve(state.importFolders);
    }),
    pickFolder: vi.fn((): Promise<string | null> => Promise.resolve('/Users/me/Designs')),
    upscaleDesign: vi.fn<DesktopApi['upscaleDesign']>(async ({ id }) => {
      const design = await getDesign({ id });
      const { width, height } = design.asset;
      const asset = { ...design.asset, width: width * 4, height: height * 4 };
      const larger = nextRevision(design, { asset, upscaleModel: state.settings.upscaleModel });
      return keepRevision(state, larger);
    }),
    rotateDesign: vi.fn<DesktopApi['rotateDesign']>(async ({ id }) => {
      const design = await getDesign({ id });
      const reason = 'The figure needs to stand upright.';
      const asset = { ...design.asset, width: design.asset.height, height: design.asset.width };
      const turned = nextRevision(design, { asset, rotation: 90, rotationReason: reason });
      return { status: 'rotated', reason, design: keepRevision(state, turned) };
    }),
    onUpscaleProgress: vi.fn((listener: (progress: UpscaleProgressDto) => void) =>
      subscribe(state.upscaleListeners, listener),
    ),
    onImportProgress: vi.fn((listener: (progress: ImportProgressDto) => void) =>
      subscribe(state.progressListeners, listener),
    ),
    onCatalogChanged: vi.fn((listener: () => void) => subscribe(state.catalogListeners, listener)),
    listFamilySizes: vi.fn<DesktopApi['listFamilySizes']>(({ familyId }) =>
      Promise.resolve(familyId === 'blanket' ? ['60″×80″', '30″×40″', '50″×60″'] : []),
    ),
  };
}

/** One page of the designs in the family and matching the search. */
function designPage(state: FakeState, request: ListDesignsRequest) {
  const search = request.search?.toLowerCase();
  const matching = state.designs.filter(
    (design) =>
      (!request.familyId || design.familyId === request.familyId) &&
      (!search ||
        `${design.designKey} ${design.concept.name ?? ''}`.toLowerCase().includes(search)),
  );
  const start = request.cursor ? Number(request.cursor) : 0;
  const limit = request.limit ?? DEFAULT_PAGE_SIZE;
  const items = matching.slice(start, start + limit);
  const next = start + limit < matching.length ? String(start + limit) : null;
  return { items, nextCursor: next, total: matching.length };
}

/** A design with its history; a larger or turned copy replaces the imported one. */
function designDetail(state: FakeState, id: string): Promise<DesignDetailDto> {
  const changed = state.upscaled.get(id);
  if (changed) return Promise.resolve(changed);
  const design = state.designs.find((candidate) => candidate.id === id);
  if (!design) return Promise.reject(new Error('missing'));
  return Promise.resolve({
    ...design,
    revisions: [
      {
        revision: 1,
        asset: design.asset,
        sourcePath: design.sourcePath,
        upscaleModel: null,
        rotation: null,
        recordedAt: design.updatedAt,
      },
    ],
  });
}

/** The design's next revision, listed first in its history. */
function nextRevision(
  design: DesignDetailDto,
  change: Pick<DesignDetailDto, 'asset'> &
    Partial<Pick<DesignDetailDto, 'upscaleModel' | 'rotation' | 'rotationReason'>>,
): DesignDetailDto {
  const revision = design.revision + 1;
  const next = { ...design, ...change, revision };
  const entry = {
    revision,
    asset: next.asset,
    sourcePath: design.sourcePath,
    upscaleModel: next.upscaleModel,
    rotation: next.rotation,
    recordedAt: design.updatedAt,
  };
  return { ...next, revisions: [entry, ...design.revisions] };
}

function keepRevision(state: FakeState, design: DesignDetailDto): DesignDetailDto {
  state.upscaled.set(design.id, design);
  notifyCatalogChanged(state);
  return design;
}

function subscribe<T>(listeners: Set<T>, listener: T): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
