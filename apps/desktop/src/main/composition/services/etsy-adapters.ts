import { EtsyClient, EtsyListings, EtsySession, EtsyShop } from '@pod/adapter-etsy';
import { WorkerPngFlattener } from '@pod/adapter-fs';
import type { Clock, ImageFlattener, MarketplaceListings, MarketplaceShop } from '@pod/core';
import type { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import { newTemporaryFile } from '../../files/temporary-file.js';
import { dataPath } from '../../files/data-folder.js';
import { translatePort } from '../provider-errors.js';
import type { SharedParts } from '../shared-parts.js';

export interface EtsyProviderOptions {
  readonly secrets: ConnectionSecrets;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
  /** A renewed sign-in could not be saved, so Etsy may need connecting again after a restart. */
  readonly onTokenNotSaved: (error: unknown) => void;
  /** Lays see-through photos onto white before upload; without it they are sent as they are. */
  readonly flattener?: ImageFlattener | undefined;
}

export interface EtsyProviders {
  readonly shop: MarketplaceShop;
  readonly listings: MarketplaceListings;
}

/** The connected Etsy shop, reading the stored sign-in when used. */
export function createEtsyProviders({
  secrets,
  fetch,
  clock,
  onTokenNotSaved,
  flattener,
}: EtsyProviderOptions): EtsyProviders {
  const session = new EtsySession({
    credentials: () => secrets.signIns.etsy.get(),
    saveRefreshToken: (previous, next) => secrets.signIns.etsy.rotateRefreshToken(previous, next),
    fetch,
    clock,
    onTokenNotSaved,
  });
  const client = new EtsyClient({ session, fetch });
  return {
    shop: translatePort(new EtsyShop(client), 'Etsy', ['options']),
    listings: translatePort(new EtsyListings(client, { clock, flattener }), 'Etsy', [
      'photos',
      'state',
    ]),
  };
}

/**
 * Photos laid onto white in worker threads, as Etsy shows a transparent
 * background as black; the copies go to the downloads folder, swept at start-up.
 */
export function pngFlattener(parts: Pick<SharedParts, 'options'>): WorkerPngFlattener {
  return new WorkerPngFlattener(
    () => newTemporaryFile(dataPath(parts.options.dataDirectory, 'downloads'), '.png'),
    parts.options.startPngWorker,
  );
}
