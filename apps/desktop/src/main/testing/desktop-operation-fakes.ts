import { vi } from 'vitest';
import { type AiCatalogDto, type MockupDto, type SceneLookPreviewDto } from '@pod/contracts';
import { designDto } from './batch-fixtures.js';
import { fakeCatalog, fakeSettings } from './fake-catalog.js';
import { desktopOperations, type DesktopOperationDeps } from '../api/desktop-operations.js';
import { type Operation } from '../api/operations.js';

/** Passed through as it is, so its contents do not matter here. */
export const AI_CATALOG = {} as AiCatalogDto;

/** The desktop operations over fakes; `overrides` swaps the parts a test looks at. */
export function makeDesktopOperations(overrides: Partial<DesktopOperationDeps> = {}): Operation[] {
  return desktopOperations({
    catalog: fakeCatalog(),
    settings: fakeSettings(),
    aiCatalog: AI_CATALOG,
    folders: {
      choose: () => Promise.resolve(null),
      remove: (folder: string) => Promise.resolve([folder]),
    },
    keywords: fakeKeywords(),
    mcpLaunch: () => ({
      command: 'app',
      args: ['--mcp-server'],
      env: {},
      outsideApplicationsFolder: false,
    }),
    connections: fakeConnections(),
    publishing: fakePublishing(),
    text: fakeText(),
    scenes: fakeScenes(),
    photos: {
      removeMockup: vi.fn(() => Promise.resolve([])),
      savePhoto: vi.fn(() => Promise.resolve(true)),
    },
    pins: fakePins(),
    batch: fakeBatch(),
    print: { listFamilySizes: vi.fn(() => Promise.resolve(['50″×60″', '60″×80″'])) },
    upscale: { upscaleDesign: vi.fn(() => Promise.resolve(designDto('01-blanket'))) },
    rotation: {
      rotateDesign: vi.fn(() =>
        Promise.resolve({
          status: 'unneeded' as const,
          reason: null,
          design: designDto('01-blanket'),
        }),
      ),
    },
    ...overrides,
  });
}

export function fakeConnections() {
  const state = Promise.resolve({
    printful: null,
    fileHost: null,
    etsy: null,
    ai: { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false },
    pinterest: null,
  });
  return {
    get: vi.fn(() => state),
    connectPrintful: vi.fn(() => state),
    startDropbox: vi.fn(() => Promise.resolve({ authorizeUrl: 'https://dropbox.test' })),
    finishDropbox: vi.fn(() => state),
    connectS3: vi.fn(() => state),
    connectSignIn: vi.fn(() => state),
    cancelSignIn: vi.fn(() => state),
    connectAi: vi.fn(() => state),
    disconnect: vi.fn(() => state),
  };
}

export function fakeKeywords() {
  return {
    importKeywordList: vi.fn(() => Promise.resolve(null)),
    listKeywordLists: vi.fn(() => Promise.resolve([])),
    getKeywordList: vi.fn(({ id }: { id: string }) => Promise.reject(new Error(`no list ${id}`))),
    removeKeywordList: vi.fn(() => Promise.resolve([])),
  };
}

/** Only passed through, so no field is looked at. */
export const sceneDto = { id: 'scene-1' } as MockupDto;
export const lookPreview = { line: null, options: {} } as SceneLookPreviewDto;

function fakeScenes() {
  return {
    createScene: vi.fn(() => Promise.resolve({ scenes: [sceneDto], candidateFailed: false })),
    confirmScenePrint: vi.fn(() => Promise.resolve(sceneDto)),
    checkSceneAgain: vi.fn(() => Promise.resolve(sceneDto)),
    describeSceneStyle: vi.fn(() => Promise.resolve(null)),
    previewSceneLook: vi.fn(() => Promise.resolve(lookPreview)),
  };
}

export function fakePins() {
  return {
    planPin: vi.fn(() => Promise.reject(new Error('unexpected call'))),
    approvePin: vi.fn(() => Promise.reject(new Error('unexpected call'))),
    publishPinNow: vi.fn(() => Promise.reject(new Error('unexpected call'))),
    removePin: vi.fn(() => Promise.resolve([])),
  };
}

function fakeText() {
  return {
    writeListingText: vi.fn(() =>
      Promise.resolve({
        title: 'T',
        description: 'D',
        tags: [],
        humanizer: { fixed: 0, left: [] },
      }),
    ),
    translateListingText: vi.fn(() => Promise.resolve({ translations: [], failed: [] })),
    checkListingText: vi.fn(() => Promise.resolve({ trademarks: ['NFL'], aiTells: [] })),
  };
}

export function fakeBatch() {
  const status = () => Promise.resolve({ job: null });
  return {
    estimateBatch: vi.fn(() => Promise.reject(new Error('unexpected call'))),
    startBatch: vi.fn(status),
    cancelBatch: vi.fn(status),
    resumeBatch: vi.fn(status),
    retryBatch: vi.fn(status),
    confirmDraftsChecked: vi.fn(status),
    getBatchListingText: vi.fn(() => Promise.resolve(null)),
  };
}

export function fakePublishing() {
  return { publishListing: vi.fn(() => Promise.reject(new Error('unexpected call'))) };
}
