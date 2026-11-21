import { createPkcePair } from '@pod/adapter-http';
import { dropboxAuthorizeUrl, exchangeDropboxCode, S3FileHost } from '@pod/adapter-file-hosts';
import { PrintfulClient, readPrintfulStore } from '@pod/adapter-printful';
import type { Clock, IdGenerator } from '@pod/core';
import { PrintfulTokenNotSingleStoreError } from '../application/errors/connection-errors.js';
import type { ConnectionChecks } from '../application/connections/connection-checks.js';
import type { FulfilmentStore } from '../application/connections/fulfilment-store.js';
import { TEXT_ADAPTERS } from './ai/ai-adapters.js';
import { signInToEtsy } from './sign-in/etsy-sign-in.js';
import { signInToPinterest } from './sign-in/pinterest-sign-in.js';

/** What connecting a service checks with that service before anything is stored. */
export function createConnectionChecks(
  fetch: typeof globalThis.fetch,
  clock: Clock,
  ids: IdGenerator,
): ConnectionChecks {
  return {
    printful: async (token) => {
      const client = new PrintfulClient({ fetch, token: () => Promise.resolve(token) });
      return storeOf(await client.get('/stores'));
    },
    s3: async (secret) => {
      const host = new S3FileHost({
        credentials: () => Promise.resolve(secret),
        fetch,
        readFile: () => Promise.resolve(new TextEncoder().encode('pod-pipeline connection test')),
        ids,
        clock,
      });
      const shared = await host.share({
        absolutePath: 'connection-test',
        mimeType: 'image/png',
        name: 'connection-test.png',
      });
      await shared.release();
    },
    dropbox: {
      createPkcePair,
      authorizeUrl: dropboxAuthorizeUrl,
      refreshToken: (appKey, code, codeVerifier) =>
        exchangeDropboxCode({ appKey, code, codeVerifier }, fetch),
    },
    aiKey: (provider, apiKey) => TEXT_ADAPTERS[provider].checkKey(apiKey, fetch),
    signIns: {
      etsy: (app, openExternal, signal) => signInToEtsy(app, openExternal, { fetch, signal }),
      pinterest: (app, openExternal, signal) =>
        signInToPinterest(app, openExternal, { fetch, signal }),
    },
  };
}

/** The one store the token reaches, as the Printful adapter reads it. */
function storeOf(stores: unknown): FulfilmentStore {
  const list = Array.isArray(stores) ? (stores as readonly unknown[]) : [];
  if (list.length !== 1) throw new PrintfulTokenNotSingleStoreError(list.length);
  return readPrintfulStore(list[0]);
}
