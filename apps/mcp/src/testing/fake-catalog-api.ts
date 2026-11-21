import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vi } from 'vitest';
import {
  ApiError,
  type BatchStatusDto,
  type CatalogApi,
  type ListingDto,
  type LiveListingPhotosDto,
} from '@pod/contracts/client';
import { AppNotRunningError } from '../connection.js';
import { registerAppTools } from '../tools/index.js';

export const researchRun = {
  id: 'r1',
  query: 'tulip mug',
  market: 'US',
  createdAt: '2026-10-26T10:00:00.000Z',
  report: {
    query: 'tulip mug',
    resultsLabel: null,
    listingCount: 0,
    organicCount: 0,
    prices: null,
    adShare: 0,
    topSellerShare: 0,
    badgeShare: 0,
    freeShippingShare: 0,
    suggestions: ['tulip mug ceramic'],
    queryTerm: {
      term: 'tulip mug',
      listings: 2,
      shops: 2,
      ads: 0,
      share: 1,
      suggested: true,
      trademark: false,
      partOfLonger: null,
      adOnly: false,
    },
    suggestionsAvailable: true,
    warnings: [],
    terms: [
      {
        term: 'tulip mug',
        listings: 2,
        shops: 2,
        ads: 0,
        share: 1,
        suggested: true,
        trademark: false,
        partOfLonger: null,
        adOnly: false,
      },
    ],
    listings: [],
    suggestedTags: ['tulip mug'],
    writerWords: [{ term: 'tulip mug', suggested: true, shops: 2 }],
  },
} as const;

export const listing: ListingDto = {
  designId: 'd1',
  listingId: '1234567890',
  state: 'draft',
  editUrl: 'https://www.etsy.com/your/shops/me/listing-editor/edit/1234567890',
  printArea: 'default',
  fit: 'contain',
  products: [{ sku: 'PF-1320', variantId: '1320' }],
  linkedAt: null,
  linkCurrent: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  publishedAt: null,
};

export const mockup = {
  id: 'm1',
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: 'Front',
  scenePrompt: null,
  sceneLook: null,
  sceneCheck: null,
  printConfirmed: false,
  canCheckAgain: false,
  asset: {
    storageKey: 'ab/m1.png',
    sha256: 'm1',
    mimeType: 'image/png',
    width: 1000,
    height: 1000,
    byteSize: 100,
  },
  createdAt: '2026-10-24T10:00:00.000Z',
};

export const pin = {
  id: 'p1',
  designId: 'd1',
  mockupId: 'm1',
  title: 'Tulip mug',
  description: '',
  altText: '',
  headline: 'Spooky',
  boardId: '11',
  link: null,
  image: { ...mockup.asset, storageKey: 'cd/p1.png', width: 1000, height: 1500 },
  aiModified: false,
  publishAt: '2026-11-02T17:00:00.000Z',
  state: 'proposed' as const,
  publishedUrl: null,
  failure: null,
  failureCode: null,
  createdAt: '2026-10-26T10:00:00.000Z',
};

export const batchStatus: BatchStatusDto = {
  job: {
    id: 'j1',
    state: 'running',
    steps: ['print', 'mockups', 'text', 'draft'],
    market: 'US',
    createdAt: '2026-10-28T09:00:00.000Z',
    finishedAt: null,
    designs: 2,
    settledDesigns: 1,
    stepCounts: {},
    current: { designKey: '02-mug', step: 'mockups' },
    failures: [
      {
        designId: 'd1',
        designKey: '01-mug',
        step: 'draft',
        error: {
          code: 'LISTING_PRICE_MISSING',
          message: 'Set a price for mug in the settings',
          details: { familyId: 'mug' },
        },
        draftCheck: null,
      },
    ],
  },
};

/** The print check every fake `checkPrint` answers with. */
const printCheck = {
  designId: 'd1',
  productId: '19',
  productName: 'White Glossy Mug',
  variants: [
    {
      id: '1320',
      name: '11 oz',
      color: 'White',
      size: '11 oz',
      areas: [{ placement: 'default', width: 2700, height: 1050, dpi: 300 }],
    },
  ],
  variantId: '1320',
  printArea: 'default',
  fit: 'contain' as const,
  placement: { left: 127, top: 0, width: 2447, height: 1050 },
  effectiveDpi: 470,
  quality: 'good' as const,
  areaCovered: 0.906,
  imageCropped: 0,
  turnsToFit: false,
  upright: null,
  productFacts: { material: 'White ceramic', care: 'Dishwasher safe', fit: '', size: '' },
};

/** The shop every fake `getShopOptions` reads. */
const shopOptions = {
  shopName: 'ExampleShop',
  currency: 'USD',
  currencyDigits: 2,
  shippingProfiles: [{ id: '316', label: 'Printful' }],
  readinessStates: [{ id: '151', label: 'made to order, 2-6 days' }],
  returnPolicies: [],
  productionPartners: [],
  languages: ['en-US'],
  draftsUrl: 'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
};

function catalogOperations() {
  return {
    listFamilies: vi.fn(() => Promise.resolve([{ id: 'mug' }])),
    listDesigns: vi.fn(() => Promise.resolve({ items: [], nextCursor: 'c2', total: 30 })),
    getDesign: vi.fn(() =>
      Promise.reject(
        new ApiError({ code: 'NOT_FOUND', message: 'Design x was not found', details: {} }),
      ),
    ),
    listImportFolders: vi.fn(() => Promise.resolve(['/Designs'])),
    previewImport: vi.fn(() => Promise.reject(new AppNotRunningError())),
    runImport: vi.fn(() =>
      Promise.resolve({
        created: ['01-mug'],
        updated: [],
        unchanged: 0,
        skipped: 0,
        renamedConceptKeys: [],
      }),
    ),
  };
}

function printOperations() {
  return {
    checkPrint: vi.fn(() => Promise.resolve(printCheck)),
    createMockups: vi.fn(() => Promise.resolve([mockup])),
    listMockups: vi.fn(() => Promise.resolve([mockup])),
  };
}

function listingOperations() {
  return {
    getShopOptions: vi.fn(() => Promise.resolve(shopOptions)),
    getListing: vi.fn((): Promise<ListingDto | null> => Promise.resolve(null)),
    createListing: vi.fn(() =>
      Promise.resolve({
        ...listing,
        trademarks: ['NFL'],
        aiTells: [
          { language: 'en', category: 'hype' as const, field: 'title' as const, match: 'Handmade' },
        ],
      }),
    ),
    linkListing: vi.fn(() =>
      Promise.resolve({ ...listing, linkedAt: '2026-10-24T11:00:00.000Z', linkCurrent: true }),
    ),
    refreshListing: vi.fn((): Promise<ListingDto | null> => Promise.resolve(null)),
    listingPhotos: vi.fn((): Promise<LiveListingPhotosDto> =>
      Promise.resolve({ marketplace: [], print: null }),
    ),
    replaceListingPhotos: vi.fn(() => Promise.resolve(listing)),
  };
}

function researchOperations() {
  return {
    researchKeywords: vi.fn(() => Promise.resolve(researchRun)),
    listResearch: vi.fn(() =>
      Promise.resolve([
        {
          id: 'r1',
          query: 'tulip mug',
          market: 'US' as const,
          createdAt: researchRun.createdAt,
          resultsLabel: null,
          topTerms: ['tulip mug'],
        },
      ]),
    ),
    getResearch: vi.fn(() => Promise.resolve(researchRun)),
  };
}

function pinAndBatchOperations() {
  return {
    listBoards: vi.fn(() => Promise.resolve([{ id: '11', name: 'Mugs' }])),
    listPins: vi.fn(() => Promise.resolve([pin])),
    proposePin: vi.fn(() => Promise.resolve(pin)),
    getBatchStatus: vi.fn(() => Promise.resolve(batchStatus)),
  };
}

/** A catalog API whose every operation answers with the fixtures here. */
export function fakeApi() {
  return {
    ...catalogOperations(),
    ...printOperations(),
    ...listingOperations(),
    ...researchOperations(),
    ...pinAndBatchOperations(),
  } satisfies CatalogApi;
}

/** A client connected to the catalog tools served over `api`. */
export async function connect(api: CatalogApi) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAppTools(server, api);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

/** The compact JSON copy a tool result carries as text. */
export function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as { text: string }[])[0]?.text ?? '';
}
