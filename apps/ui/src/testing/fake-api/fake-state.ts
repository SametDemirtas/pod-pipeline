import type {
  BatchStatusDto,
  ConnectionsDto,
  DesignDetailDto,
  DesignDto,
  ImportProgressDto,
  KeywordListDto,
  ListingDto,
  MockupDto,
  PinDto,
  ResearchRunDto,
  SettingsDto,
  UpscaleProgressDto,
} from '@pod/contracts/client';

/** What the fake app holds between calls, shared by the parts of the fake API. */
export interface FakeState {
  readonly designs: readonly DesignDto[];
  /** Designs made larger, which read as their next revision. */
  readonly upscaled: Map<string, DesignDetailDto>;
  importFolders: readonly string[];
  settings: SettingsDto;
  connections: ConnectionsDto;
  mockups: readonly MockupDto[];
  readonly listings: Map<string, ListingDto>;
  /** Designs whose draft may be on Etsy; like the app, no draft is made for them. */
  readonly unchecked: Set<string>;
  runs: ResearchRunDto[];
  keywordLists: KeywordListDto[];
  pins: PinDto[];
  batch: BatchStatusDto;
  readonly progressListeners: Set<(progress: ImportProgressDto) => void>;
  readonly catalogListeners: Set<() => void>;
  readonly batchListeners: Set<(status: BatchStatusDto) => void>;
  readonly upscaleListeners: Set<(progress: UpscaleProgressDto) => void>;
}

export function createFakeState(designs: readonly DesignDto[]): FakeState {
  return {
    designs,
    upscaled: new Map(),
    importFolders: ['/Users/me/Designs'],
    settings: {
      language: 'en',
      textProvider: 'anthropic',
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
      sceneProvider: 'gemini',
      sceneModel: 'gemini-nano-banana-2.1',
      productFacts: {
        mug: { material: 'White ceramic', care: 'Dishwasher safe', fit: '', size: '' },
        't-shirt': { material: '100% cotton', care: '', fit: 'Unisex fit', size: '' },
      },
      aiDesigns: false,
      samsungFromIphone: true,
      upscaleModel: 'illustration',
      autoUpscale: false,
      listingPrices: {},
      shippingProfiles: {},
      sizePrices: {},
      listingSizes: { blanket: ['50″×60″'] },
    },
    connections: {
      printful: null,
      fileHost: null,
      etsy: null,
      ai: { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false },
      pinterest: null,
    },
    mockups: [],
    listings: new Map(),
    unchecked: new Set(),
    runs: [],
    keywordLists: [],
    pins: [],
    batch: { job: null },
    progressListeners: new Set(),
    catalogListeners: new Set(),
    batchListeners: new Set(),
    upscaleListeners: new Set(),
  };
}

export function notifyCatalogChanged(state: FakeState): void {
  for (const listener of state.catalogListeners) listener();
}
