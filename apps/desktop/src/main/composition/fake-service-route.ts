import { DATA_DIRECTORY_VARIABLE } from '@pod/contracts';
import { plainEncryption } from '../storage/plain-encryption.js';
import type { Encryption } from '../storage/secret-file.js';

/**
 * Names the address of a local fake of Etsy, Printful, Pinterest and the file
 * hosts, for the end-to-end tests. A packaged app never reads it.
 */
export const FAKE_SERVICES_VARIABLE = 'POD_FAKE_SERVICES_URL';

/** How a test build reaches the fake services instead of the real ones. */
export interface FakeServiceRoute {
  /** Sends every https request to the fake, the host leading the path. */
  readonly fetch: typeof fetch;
  /** Opens a consent page by asking the fake for it, which then answers the sign-in. */
  readonly openExternal: (url: string) => Promise<void>;
  /** Stores secrets unprotected, so tests need no keychain. */
  readonly encryption: Encryption;
}

/**
 * The route to the fake services the variable names, in a development build
 * with its own data folder only, so plain secrets never reach the seller's
 * profile; `undefined` when packaged or when the variable is not set.
 */
export function fakeServiceRoute(
  env: Readonly<Record<string, string | undefined>>,
  packaged: boolean,
): FakeServiceRoute | undefined {
  const address = env[FAKE_SERVICES_VARIABLE];
  if (packaged || !address) return undefined;
  if (!env[DATA_DIRECTORY_VARIABLE]) {
    throw new Error(`${FAKE_SERVICES_VARIABLE} needs ${DATA_DIRECTORY_VARIABLE} as well`);
  }
  const base = new URL(address);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') {
    throw new Error(`${FAKE_SERVICES_VARIABLE} must be a loopback http address`);
  }
  const routed: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.protocol !== 'https:') return fetch(request);
    const target = new URL(`${url.hostname}${url.pathname}${url.search}`, ensureSlash(base));
    return fetch(new Request(target, request));
  };
  return {
    fetch: routed,
    openExternal: openThrough(routed),
    encryption: plainEncryption,
  };
}

/** Opens a page by fetching it, as a browser would, and reads it to the end. */
export function openThrough(fetchPage: typeof fetch): (url: string) => Promise<void> {
  return async (url) => {
    await (await fetchPage(url)).arrayBuffer();
  };
}

function ensureSlash(base: URL): URL {
  return base.pathname.endsWith('/') ? base : new URL(`${base.pathname}/`, base);
}
