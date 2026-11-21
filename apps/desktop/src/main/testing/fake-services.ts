import { fakeDropbox } from './fake-services/dropbox.js';
import { fakeEtsy } from './fake-services/etsy.js';
import { json, notFound, type FakeService } from './fake-services/http.js';
import { oauthServices } from './fake-services/oauth.js';
import { fakePinterest } from './fake-services/pinterest.js';
import { fakePrintful } from './fake-services/printful.js';
import type { MockupSwitch } from './fake-services/printful-mockups.js';

export { ETSY_SHOP_ID } from './fake-services/etsy.js';
export { FAKE_CODE } from './fake-services/oauth.js';

export interface FakeServices {
  /** Answers one request as the services would; anything unknown gets a 404. */
  handle(request: Request): Promise<Response>;
  /** Every request answered so far, as `METHOD https://host/path` without the query. */
  readonly calls: readonly string[];
  /** While set, Printful keeps every mockup task pending. */
  readonly mockups: MockupSwitch;
  /** The images of the pins sent to Pinterest, in order. */
  readonly pinImages: readonly Uint8Array[];
}

/**
 * Etsy, Printful, Pinterest and Dropbox in memory, answering with the shapes
 * their APIs use. Printful imports the variations of the Etsy shop's listings.
 */
export function fakeServices(): FakeServices {
  const etsy = fakeEtsy();
  const mockups: MockupSwitch = { held: false };
  const pinImages: Uint8Array[] = [];
  // Token endpoints first: Pinterest's lies below its API's address.
  const services: readonly FakeService[] = [
    ...oauthServices(),
    etsy.service,
    ...fakePrintful(etsy.productIds, mockups),
    fakePinterest(pinImages),
    ...fakeDropbox(),
  ];
  const calls: string[] = [];

  return {
    calls,
    mockups,
    pinImages,
    handle: async (request) => {
      const url = new URL(request.url);
      const address = `${url.origin}${url.pathname}`;
      calls.push(`${request.method} ${address}`);
      const service = services.find(
        ({ base }) => address === base || address.startsWith(`${base}/`),
      );
      if (!service) return notFound();
      if (service.signedIn && !/^Bearer \S+/.test(request.headers.get('authorization') ?? '')) {
        return json({ error: 'invalid_token' }, 401);
      }
      const path = address.slice(service.base.length);
      for (const { method, path: pattern, answer } of service.routes) {
        const match = method === request.method ? pattern.exec(path) : null;
        if (match) return answer(request, match.slice(1).map(decodeURIComponent), url);
      }
      return (service.missing ?? notFound)();
    },
  };
}

/** `fetch` answered by the fake, for tests that pass a fetch to the services. */
export function fakeFetch(services: FakeServices): typeof fetch {
  return (input, init) => services.handle(new Request(input, init));
}
