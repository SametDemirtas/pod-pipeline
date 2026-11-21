import { ETSY_LINKS } from '@pod/adapter-etsy';
import { LISTING_RULES } from '@pod/rules';
import { remoteThumbnails } from '@pod/adapter-http';
import {
  CreateListingDraft,
  DraftGuard,
  LinkListing,
  LiveListingPhotos,
  PublishListing,
  RefreshListing,
  ReplaceListingPhotos,
  type MarketplaceListings,
} from '@pod/core';
import type { ConnectionsService } from '../../application/connections/connections-service.js';
import { ListingService } from '../../application/listing/listing-service.js';
import { SettingsPorts } from '../../application/settings/settings-ports.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { createEtsyProviders, pngFlattener } from './etsy-adapters.js';
import type { SharedParts } from '../shared-parts.js';

/** Etsy drafts, their Printful link and publishing them. */
export function createListingService(
  parts: Pick<
    SharedParts,
    | 'print'
    | 'clock'
    | 'ids'
    | 'listings'
    | 'assets'
    | 'catalog'
    | 'secrets'
    | 'fetch'
    | 'options'
    | 'mockups'
    | 'checkPrint'
    | 'draftChecks'
  >,
  settings: SettingsStore,
  connections?: Pick<ConnectionsService, 'fulfilmentStoreMismatch'>,
): ListingService {
  const { print, clock, listings, assets } = parts;
  const query = parts.catalog.query;
  const etsy = etsyProviders(parts);
  return new ListingService({
    query,
    shop: etsy.shop,
    links: ETSY_LINKS,
    listings,
    createDraft: createDraftOn(parts, settings, etsy.listings),
    link: linkListing(parts),
    publish: new PublishListing({ query, listings, marketplace: etsy.listings, clock }),
    refresh: new RefreshListing({ query, listings, marketplace: etsy.listings, clock }),
    livePhotos: new LiveListingPhotos({
      query,
      listings,
      marketplace: etsy.listings,
      printSync: print.printSync,
    }),
    thumbnail: remoteThumbnails(parts.fetch),
    replacePhotos: new ReplaceListingPhotos({
      query,
      listings,
      mockups: parts.mockups,
      assets,
      marketplace: etsy.listings,
      rules: LISTING_RULES,
    }),
    events: parts.options.events,
    fulfilmentStoreMismatch: connections && (() => connections.fulfilmentStoreMismatch()),
  });
}

/** Etsy's shop and listings, noting a renewed sign-in that could not be saved. */
function etsyProviders(
  parts: Pick<SharedParts, 'secrets' | 'fetch' | 'clock' | 'options'>,
): ReturnType<typeof createEtsyProviders> {
  return createEtsyProviders({
    secrets: parts.secrets,
    fetch: parts.fetch,
    clock: parts.clock,
    onTokenNotSaved: (error) => {
      parts.secrets.unsavedSignIns.failed('etsy', error, parts.options.logError);
    },
    flattener: pngFlattener(parts),
  });
}

/** Tells the print provider what to make for each variant of a listing. */
function linkListing(
  parts: Pick<SharedParts, 'catalog' | 'print' | 'listings' | 'assets' | 'clock'>,
): LinkListing {
  const { print } = parts;
  return new LinkListing({
    query: parts.catalog.query,
    printCatalog: print.printCatalog,
    listings: parts.listings,
    printSync: print.printSync,
    fileHost: print.fileHost,
    assets: parts.assets,
    clock: parts.clock,
    orientation: print.generator,
  });
}

/** Drafts on the marketplace, guarded against a second draft while one may exist there. */
function createDraftOn(
  parts: Pick<
    SharedParts,
    'checkPrint' | 'mockups' | 'assets' | 'listings' | 'draftChecks' | 'options' | 'clock' | 'ids'
  >,
  settings: SettingsStore,
  marketplace: MarketplaceListings,
): CreateListingDraft {
  return new CreateListingDraft({
    checkPrint: parts.checkPrint,
    mockups: parts.mockups,
    assets: parts.assets,
    marketplace,
    listings: parts.listings,
    disclosure: new SettingsPorts(settings),
    guard: new DraftGuard(parts.draftChecks, parts.options.logError),
    clock: parts.clock,
    ids: parts.ids,
    rules: LISTING_RULES,
  });
}
