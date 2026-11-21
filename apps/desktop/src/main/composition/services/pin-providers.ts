import type { ContentAddressedStore } from '@pod/adapter-fs';
import { ETSY_LINKS } from '@pod/adapter-etsy';
import {
  PINTEREST_LINKS,
  PinterestApi,
  PinterestClient,
  PinterestSession,
} from '@pod/adapter-pinterest';
import { SqlitePinRepository } from '@pod/adapter-sqlite';
import type {
  CatalogQuery,
  Clock,
  IdGenerator,
  ImageInspector,
  ListingRepository,
  MockupRepository,
  TemporaryFile,
} from '@pod/core';
import { ApprovePin, PlanPin, PublishPins, RemovePin, type PinRepository } from '@pod/core';
import { PinterestNotConnectedError } from '../../application/errors/connection-errors.js';
import { PinSentUnconfirmedError } from '../../application/errors/pin-errors.js';
import { ProviderUnavailableError } from '../../application/errors/provider-errors.js';
import type { CatalogEvents } from '../../application/catalog/catalog-service.js';
import type { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { PinService } from '../../application/pins/pin-service.js';
import { redactingPins } from '../../application/pins/redacting-pins.js';
import { HtmlPinComposer } from '../../pins/html-pin-composer.js';
import { translatePort } from '../provider-errors.js';
import type { SharedParts } from '../shared-parts.js';

export interface PinServiceOptions {
  readonly secrets: ConnectionSecrets;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly inspector: ImageInspector;
  readonly query: CatalogQuery;
  readonly mockups: MockupRepository;
  readonly listings: ListingRepository;
  readonly pins: PinRepository;
  readonly assets: ContentAddressedStore;
  /** Renders a pin page offscreen as PNG; a hidden window in the app. */
  readonly renderPin: (html: string) => Promise<Uint8Array>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
  readonly writeTemporary: (bytes: Uint8Array) => Promise<TemporaryFile>;
  /** Records a pin outcome that could not be saved; the pin is recovered on the next start. */
  readonly logError: (error: unknown) => void;
  /** A renewed sign-in could not be saved, so Pinterest may need connecting again after a restart. */
  readonly onTokenNotSaved: (error: unknown) => void;
}

/**
 * A lost sign-in, or a network that never reached Pinterest, would fail every
 * pin alike, so publishing waits instead.
 */
export function isOutage(error: unknown): boolean {
  return error instanceof PinterestNotConnectedError || error instanceof ProviderUnavailableError;
}

/**
 * Only the adapter knows whether the pin itself was sent before the failure;
 * any other interruption left nothing on Pinterest.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof PinSentUnconfirmedError;
}

/** Pins planned in the app, made with the pin composer and published with the seller's sign-in. */
export function createPinService(options: PinServiceOptions): PinService {
  const { secrets, fetch, clock, assets, pins } = options;
  const session = new PinterestSession({
    credentials: () => secrets.signIns.pinterest.get(),
    saveRefreshToken: (previous, next) =>
      secrets.signIns.pinterest.rotateRefreshToken(previous, next),
    fetch,
    clock,
    onTokenNotSaved: options.onTokenNotSaved,
  });
  const pinterest = translatePort(
    new PinterestApi(new PinterestClient({ session, fetch })),
    'Pinterest',
    ['boards', 'username'],
  );
  return new PinService({
    plan: new PlanPin({
      query: options.query,
      mockups: options.mockups,
      listings: options.listings,
      links: ETSY_LINKS,
      composer: new HtmlPinComposer({
        renderPng: options.renderPin,
        writeTemporary: options.writeTemporary,
      }),
      inspector: options.inspector,
      assets,
      pins,
      clock,
      ids: options.ids,
    }),
    publish: new PublishPins({
      pins,
      query: options.query,
      mockups: options.mockups,
      publisher: pinterest,
      listings: options.listings,
      links: ETSY_LINKS,
      assets,
      clock,
      isOutage,
      isOutcomeUnknown,
      onSaveError: options.logError,
    }),
    approve: new ApprovePin(pins),
    remove: new RemovePin(pins),
    pins,
    publisher: pinterest,
    links: PINTEREST_LINKS,
    connected: async () => (await secrets.signIns.pinterest.get()) !== undefined,
    events: options.events,
  });
}

/** The pin service from the parts every service shares, with pins stored in the database. */
export function createPinServiceFor(
  parts: Pick<
    SharedParts,
    | 'options'
    | 'secrets'
    | 'fetch'
    | 'clock'
    | 'ids'
    | 'inspector'
    | 'catalog'
    | 'mockups'
    | 'listings'
    | 'database'
    | 'assets'
    | 'writeTemporary'
  >,
): PinService {
  const { options } = parts;
  return createPinService({
    secrets: parts.secrets,
    fetch: parts.fetch,
    clock: parts.clock,
    ids: parts.ids,
    inspector: parts.inspector,
    query: parts.catalog.query,
    mockups: parts.mockups,
    listings: parts.listings,
    pins: redactingPins(new SqlitePinRepository(parts.database)),
    assets: parts.assets,
    renderPin: options.renderPin,
    events: options.events,
    writeTemporary: parts.writeTemporary,
    logError: options.logError,
    onTokenNotSaved: (error) => {
      parts.secrets.unsavedSignIns.failed('pinterest', error, options.logError);
    },
  });
}
