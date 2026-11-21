import { vi } from 'vitest';
import type { CatalogApi, SettingsDto } from '@pod/contracts';
import { NotFoundError } from '@pod/core';
import type { SettingsStore } from '../application/settings/settings-store.js';

/** Catalog whose operations are spies with simple canned answers. */
export function fakeCatalog() {
  return {
    listFamilies: vi.fn<CatalogApi['listFamilies']>(() => Promise.resolve([])),
    listDesigns: vi.fn<CatalogApi['listDesigns']>(() =>
      Promise.resolve({ items: [], nextCursor: null, total: 0 }),
    ),
    getDesign: vi.fn<CatalogApi['getDesign']>(() =>
      Promise.reject(new NotFoundError('Design', 'x')),
    ),
    previewImport: vi.fn<CatalogApi['previewImport']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    runImport: vi.fn<CatalogApi['runImport']>(() => Promise.reject(new Error('unexpected call'))),
    listImportFolders: vi.fn<CatalogApi['listImportFolders']>(() => Promise.resolve([])),
    checkPrint: vi.fn<CatalogApi['checkPrint']>(() => Promise.reject(new Error('unexpected call'))),
    createMockups: vi.fn<CatalogApi['createMockups']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    listMockups: vi.fn<CatalogApi['listMockups']>(() => Promise.resolve([])),
    getShopOptions: vi.fn<CatalogApi['getShopOptions']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    getListing: vi.fn<CatalogApi['getListing']>(() => Promise.resolve(null)),
    createListing: vi.fn<CatalogApi['createListing']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    linkListing: vi.fn<CatalogApi['linkListing']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    refreshListing: vi.fn<CatalogApi['refreshListing']>(() => Promise.resolve(null)),
    listingPhotos: vi.fn<CatalogApi['listingPhotos']>(() =>
      Promise.resolve({ marketplace: [], print: null }),
    ),
    replaceListingPhotos: vi.fn<CatalogApi['replaceListingPhotos']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    researchKeywords: vi.fn<CatalogApi['researchKeywords']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    listResearch: vi.fn<CatalogApi['listResearch']>(() => Promise.resolve([])),
    getResearch: vi.fn<CatalogApi['getResearch']>(() =>
      Promise.reject(new Error('unexpected call')),
    ),
    listBoards: vi.fn<CatalogApi['listBoards']>(() => Promise.resolve([])),
    listPins: vi.fn<CatalogApi['listPins']>(() => Promise.resolve([])),
    proposePin: vi.fn<CatalogApi['proposePin']>(() => Promise.reject(new Error('unexpected call'))),
    getBatchStatus: vi.fn<CatalogApi['getBatchStatus']>(() => Promise.resolve({ job: null })),
  } satisfies CatalogApi;
}

/** Settings with every choice at its default, but for the ones given. */
export function settingsDto(overrides: Partial<SettingsDto> = {}): SettingsDto {
  return {
    language: 'en',
    textProvider: 'anthropic',
    textModel: 'claude-opus-5-5',
    checkModel: 'claude-haiku-5-5',
    sceneProvider: 'gemini',
    sceneModel: 'gemini-nano-banana-2.1',
    productFacts: {},
    aiDesigns: false,
    samsungFromIphone: true,
    upscaleModel: 'illustration',
    autoUpscale: false,
    listingPrices: {},
    shippingProfiles: {},
    sizePrices: {},
    listingSizes: {},
    ...overrides,
  };
}

/** Settings with every choice at its default; only the language changes. */
export function fakeSettings(): Pick<SettingsStore, 'get' | 'update'> {
  let current = settingsDto();
  return {
    get: () => Promise.resolve(current),
    update: (request) => {
      current = { ...current, language: request.language ?? current.language };
      return Promise.resolve(current);
    },
  };
}
