import { vi } from 'vitest';
import { ApiError, type DesktopApi, type ListingDto } from '@pod/contracts/client';
import { listingDto, shopOptionsDto } from '../dtos/listing-dtos.js';
import type { FakeState } from './fake-state.js';

/** The Etsy shop, listings and their text. */
export function fakeListingApi(state: FakeState) {
  const changeListing = (id: string, change: Partial<ListingDto>) => {
    const current = state.listings.get(id);
    if (!current) return Promise.reject(new Error(`no listing for ${id}`));
    const next = { ...current, ...change };
    state.listings.set(id, next);
    return Promise.resolve(next);
  };
  return {
    getShopOptions: vi.fn<DesktopApi['getShopOptions']>(() => Promise.resolve(shopOptionsDto())),
    getListing: vi.fn<DesktopApi['getListing']>(({ id }) =>
      Promise.resolve(state.listings.get(id) ?? null),
    ),
    createListing: vi.fn<DesktopApi['createListing']>((request) => {
      if (state.unchecked.has(request.designId)) {
        return Promise.reject(
          new ApiError({ code: 'DRAFTS_NOT_CHECKED', message: 'unchecked', details: {} }),
        );
      }
      const listing = listingDto({
        designId: request.designId,
        products: request.variantIds.map((variantId) => ({ sku: `PF-${variantId}`, variantId })),
      });
      state.listings.set(request.designId, listing);
      return Promise.resolve({ ...listing, trademarks: [], aiTells: [] });
    }),
    linkListing: vi.fn<DesktopApi['linkListing']>(({ id }) =>
      changeListing(id, { linkedAt: '2026-10-24T11:00:00.000Z', linkCurrent: true }),
    ),
    refreshListing: vi.fn<DesktopApi['refreshListing']>(({ id }) =>
      Promise.resolve(state.listings.get(id) ?? null),
    ),
    listingPhotos: vi.fn<DesktopApi['listingPhotos']>(() =>
      Promise.resolve({ marketplace: [], print: null }),
    ),
    replaceListingPhotos: vi.fn<DesktopApi['replaceListingPhotos']>(({ designId }) =>
      changeListing(designId, {}),
    ),
    publishListing: vi.fn<DesktopApi['publishListing']>(({ id }) =>
      changeListing(id, { state: 'active', publishedAt: '2026-10-24T12:00:00.000Z' }),
    ),
    ...fakeListingTextApi(),
  };
}

/** Writing, translating and checking a listing's words. */
function fakeListingTextApi() {
  return {
    writeListingText: vi.fn<DesktopApi['writeListingText']>(() =>
      Promise.resolve({
        title: 'Lantern Harbor Mug for Bird Lovers',
        description: 'A cosy mug written by Claude.',
        tags: ['tulip mug', 'bird lover gift'],
        humanizer: { fixed: 2, left: [] },
      }),
    ),
    translateListingText: vi.fn<DesktopApi['translateListingText']>((request) =>
      Promise.resolve({
        translations: request.languages.map((language) => ({
          language,
          title: `[${language}] ${request.title}`,
          description: `[${language}] ${request.description}`,
          tags: request.tags,
          humanizer: { fixed: 0, left: [] },
        })),
        failed: [],
      }),
    ),
    // Names a few known trademarks and phrases, enough to see the warnings come and go.
    checkListingText: vi.fn<DesktopApi['checkListingText']>(({ title, description, tags }) =>
      Promise.resolve({
        trademarks: ['Star Wars', 'NFL'].filter((name) =>
          [title, ...tags].some((words) => words.toLowerCase().includes(name.toLowerCase())),
        ),
        aiTells: ['elevate your', 'look no further'].flatMap((phrase) => {
          const at = description.toLowerCase().indexOf(phrase);
          const match = description.slice(at, at + phrase.length);
          return at < 0
            ? []
            : [{ category: 'hype' as const, field: 'description' as const, match }];
        }),
      }),
    ),
  };
}
