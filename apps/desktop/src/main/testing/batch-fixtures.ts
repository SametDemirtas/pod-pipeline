import type {
  DesignDetailDto,
  MockupDto,
  PrintCheckDto,
  ResearchRunDto,
  ShopOptionsDto,
} from '@pod/contracts';

/** A design whose concept and family are read from its key, e.g. `01-mug`. */
export function designDto(designKey: string, name: string | null = 'Meadow Bees') {
  const asset = {
    storageKey: `ab/${designKey}.png`,
    sha256: designKey,
    mimeType: 'image/png',
    width: 3000,
    height: 1200,
    byteSize: 100,
  };
  return {
    id: `id-${designKey}`,
    designKey,
    familyId: designKey.slice(designKey.indexOf('-') + 1),
    revision: 1,
    concept: { id: `c-${designKey}`, key: designKey.slice(0, 2), name },
    asset,
    sourcePath: `/designs/${designKey}.png`,
    upscaleModel: null,
    rotation: null,
    rotationReason: null,
    keptOrientationReason: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    revisions: [],
  } satisfies DesignDetailDto;
}

/** A mug in two sizes, checked on the 11 oz one. */
export function printCheckDto(overrides: Partial<PrintCheckDto> = {}): PrintCheckDto {
  const area = (height: number) => [{ placement: 'default', width: 2700, height, dpi: 300 }];
  return {
    designId: 'id-01-mug',
    productId: '19',
    productName: 'White Glossy Mug',
    variants: [
      { id: '1320', name: 'Mug 11 oz', color: 'White', size: '11 oz', areas: area(1050) },
      { id: '4830', name: 'Mug 15 oz', color: 'White', size: '15 oz', areas: area(1140) },
      { id: '9999', name: 'Mug 11 oz black', color: 'Black', size: '11 oz', areas: area(1050) },
    ],
    variantId: '1320',
    printArea: 'default',
    fit: 'contain',
    placement: { left: 0, top: 0, width: 2700, height: 1050 },
    effectiveDpi: 300,
    quality: 'good',
    areaCovered: 1,
    imageCropped: 0,
    turnsToFit: false,
    upright: null,
    productFacts: { material: '', care: '', fit: '', size: '' },
    ...overrides,
  };
}

export function mockupDto(id: string, overrides: Partial<MockupDto> = {}): MockupDto {
  return {
    id,
    designRevision: 1,
    variantId: '1320',
    printArea: 'default',
    view: 'front',
    scenePrompt: null,
    sceneLook: null,
    sceneCheck: null,
    printConfirmed: false,
    canCheckAgain: false,
    asset: {
      storageKey: `ab/${id}.png`,
      sha256: id,
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      byteSize: 100,
    },
    createdAt: '2026-10-02T10:00:00.000Z',
    ...overrides,
  };
}

export function shopOptionsDto(overrides: Partial<ShopOptionsDto> = {}): ShopOptionsDto {
  return {
    shopName: 'ExampleShop',
    currency: 'USD',
    currencyDigits: 2,
    shippingProfiles: [{ id: '316', label: 'Printful' }],
    readinessStates: [{ id: '151', label: 'made to order' }],
    returnPolicies: [{ id: '1518', label: '14 days' }],
    productionPartners: [{ id: '77', label: 'Printful' }],
    languages: ['en-US', 'de', 'fr'],
    draftsUrl: 'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
    ...overrides,
  };
}

/** A search whose writer words are the query and one more phrase. */
export function researchRunDto(id: string, query: string, createdAt: string): ResearchRunDto {
  return {
    id,
    query,
    market: 'US',
    createdAt,
    report: {
      writerWords: [
        { term: query, suggested: true, shops: 0 },
        { term: 'fall coffee mug', suggested: false, shops: 3 },
      ],
    } as unknown as ResearchRunDto['report'],
  };
}
