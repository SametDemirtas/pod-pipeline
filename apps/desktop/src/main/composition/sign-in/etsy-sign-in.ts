import {
  ETSY_REDIRECT_PATH,
  ETSY_REDIRECT_PORT,
  EtsyClient,
  etsyAuthorizeUrl,
  type EtsyAuth,
  exchangeEtsyCode,
  findAccountShop,
} from '@pod/adapter-etsy';
import { createPkcePair } from '@pod/adapter-http';
import type { EtsyAccess, EtsyApp } from '../../application/connections/connection-checks.js';
import { authorizeInBrowser, type BrowserSignInDeps } from '../../sign-in/oauth-redirect.js';
import { signalOption } from '../../shared/signal-option.js';

/** Signs in with the seller's own Etsy app and finds the shop it belongs to. */
export async function signInToEtsy(
  app: EtsyApp,
  openExternal: (url: string) => Promise<void>,
  deps: BrowserSignInDeps,
): Promise<EtsyAccess> {
  const { verifier, challenge } = createPkcePair();
  const code = await authorizeInBrowser(
    {
      service: 'Etsy',
      path: ETSY_REDIRECT_PATH,
      port: deps.port ?? ETSY_REDIRECT_PORT,
      ...signalOption(deps.signal),
    },
    (state) => etsyAuthorizeUrl({ keystring: app.keystring, codeChallenge: challenge, state }),
    openExternal,
  );
  const token = await exchangeEtsyCode(
    { keystring: app.keystring, code, codeVerifier: verifier },
    deps.fetch,
    deps.signal,
  );
  return { refreshToken: token.refreshToken, ...(await shopOf(app, token.accessToken, deps)) };
}

/** Uses the fresh access token as it is: refreshing would replace the refresh token. */
async function shopOf(app: EtsyApp, accessToken: string, deps: BrowserSignInDeps) {
  const session: EtsyAuth = {
    credentials: () => Promise.resolve({ ...app, shopId: '' }),
    accessToken: () => Promise.resolve(accessToken),
    invalidate: () => undefined,
  };
  const client = new EtsyClient({
    session,
    fetch: deps.fetch,
    ...signalOption(deps.signal),
  });
  return findAccountShop(client);
}
