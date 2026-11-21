import type {
  KeywordListDto,
  ListingDto,
  ResearchMarket,
  ResearchRunDto,
  PinDto,
  ShopOptionsDto,
} from '@pod/contracts/client';

export function shopOptionsDto(overrides: Partial<ShopOptionsDto> = {}): ShopOptionsDto {
  return {
    shopName: 'ExampleShop',
    currency: 'USD',
    currencyDigits: 2,
    shippingProfiles: [{ id: '316', label: 'Printful: Mugs' }],
    readinessStates: [{ id: '151', label: 'made to order, 2-6 days' }],
    returnPolicies: [{ id: '1518', label: 'Returns within 14 days' }],
    productionPartners: [{ id: '77', label: 'Printful' }],
    languages: ['en-US', 'de', 'fr'],
    draftsUrl: 'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
    ...overrides,
  };
}

type ResearchTermDto = ResearchRunDto['report']['terms'][number];

function researchTerm(text: string, overrides: Partial<ResearchTermDto>): ResearchTermDto {
  return {
    term: text,
    listings: 2,
    shops: 2,
    ads: 0,
    share: 1,
    suggested: false,
    trademark: false,
    partOfLonger: null,
    adOnly: false,
    ...overrides,
  };
}

/** Terms of a run, one naming a trademark and one too long for a tag. */
function researchTerms(query: string): ResearchTermDto[] {
  return [
    researchTerm('disney tulip mug', { shops: 3, listings: 3, trademark: true }),
    researchTerm('mug', { shops: 3, listings: 4 }),
    researchTerm(query, { suggested: true, ads: 1 }),
    researchTerm('halloween coffee mug', {}),
    researchTerm('a phrase far too long for a tag', {}),
  ];
}

/** Words a run hands the writer; a query no result used counts no shops. */
function writerWords(query: string): ResearchRunDto['report']['writerWords'] {
  return [
    { term: query, suggested: true, shops: 0 },
    { term: 'halloween coffee mug', suggested: false, shops: 1 },
    { term: 'a phrase far too long for a tag', suggested: false, shops: 1 },
    { term: 'mug', suggested: false, shops: 3 },
  ];
}

export function researchRunDto(
  id: string,
  query: string,
  market: ResearchMarket = 'US',
): ResearchRunDto {
  return {
    id,
    query,
    market,
    createdAt: '2026-10-26T10:00:00.000Z',
    report: {
      query,
      resultsLabel: '1,000+',
      listingCount: 2,
      organicCount: 1,
      prices: { currency: 'USD', min: 18, median: 20, max: 22 },
      adShare: 0.5,
      topSellerShare: 0.5,
      badgeShare: 0,
      freeShippingShare: 0.5,
      queryTerm: researchTerm(query.toLowerCase(), { suggested: true, ads: 1 }),
      suggestions: [`${query} ceramic`],
      suggestionsAvailable: true,
      warnings: [],
      terms: researchTerms(query),
      listings: [
        {
          listingId: '1',
          title: `${query} for bird lovers`,
          shopName: 'MoonShop',
          price: 18,
          currency: 'USD',
          onSale: false,
          freeShipping: true,
          isAd: true,
          isTopSeller: true,
          badges: ['marketPick'],
        },
        {
          listingId: '2',
          title: `Cute ${query}`,
          shopName: 'PaperFox',
          price: null,
          currency: null,
          onSale: false,
          freeShipping: false,
          isAd: false,
          isTopSeller: false,
          badges: [],
        },
      ],
      suggestedTags: [query, 'halloween coffee mug'],
      writerWords: writerWords(query),
    },
  };
}

export function keywordListDto(
  id: string,
  market: ResearchMarket = 'US',
  fileName = 'erank-tulip-mug.csv',
): KeywordListDto {
  const keyword = (term: string, searches: number | null, trademark = false) => ({
    term,
    trademark,
    searches,
    clicks: searches === null ? null : Math.round(searches / 10),
    ctr: searches === null ? null : 45.5,
    competition: searches === null ? null : 98_765,
  });
  return {
    id,
    fileName,
    market,
    importedAt: '2026-10-26T11:00:00.000Z',
    figures: ['searches', 'clicks', 'ctr', 'competition'],
    keywords: [
      keyword('tulip mug gift', 12_345),
      keyword('disney mug', 900, true),
      keyword('spooky mug', null),
    ],
    truncated: false,
  };
}

export function listingDto(overrides: Partial<ListingDto> = {}): ListingDto {
  return {
    designId: 'id-01-mug',
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
    ...overrides,
  };
}

export function pinDto(overrides: Partial<PinDto> = {}): PinDto {
  return {
    id: 'pin-1',
    designId: 'id-01-mug',
    mockupId: 'm-front',
    title: 'Tulip mug',
    description: '',
    altText: '',
    headline: '',
    boardId: '5001',
    link: null,
    image: {
      storageKey: 'pins/pin-1.png',
      sha256: 'pin-1',
      mimeType: 'image/png',
      width: 1000,
      height: 1500,
      byteSize: 1000,
    },
    aiModified: false,
    publishAt: '2026-11-02T17:00:00.000Z',
    state: 'planned',
    publishedUrl: null,
    failure: null,
    failureCode: null,
    createdAt: '2026-10-26T10:00:00.000Z',
    ...overrides,
  };
}
