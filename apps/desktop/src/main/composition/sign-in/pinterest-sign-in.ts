import {
  exchangePinterestCode,
  PINTEREST_REDIRECT_PATH,
  PINTEREST_REDIRECT_PORT,
  PinterestApi,
  PinterestClient,
  pinterestAuthorizeUrl,
  type PinterestApp,
} from '@pod/adapter-pinterest';
import type { PinterestAccess } from '../../application/connections/connection-checks.js';
import { authorizeInBrowser, type BrowserSignInDeps } from '../../sign-in/oauth-redirect.js';
import { signalOption } from '../../shared/signal-option.js';

/** Signs in with the seller's own Pinterest app and reads the account's name. */
export async function signInToPinterest(
  app: PinterestApp,
  openExternal: (url: string) => Promise<void>,
  deps: BrowserSignInDeps,
): Promise<PinterestAccess> {
  const code = await authorizeInBrowser(
    {
      service: 'Pinterest',
      path: PINTEREST_REDIRECT_PATH,
      port: deps.port ?? PINTEREST_REDIRECT_PORT,
      ...signalOption(deps.signal),
    },
    (state) => pinterestAuthorizeUrl(app.appId, state),
    openExternal,
  );
  const token = await exchangePinterestCode(app, code, deps.fetch, deps.signal);
  if (token.refreshToken === null) throw new Error('Pinterest did not hand out a refresh token');
  // The fresh access token is used as it is; the session refreshes later ones.
  const client = new PinterestClient({
    session: {
      accessToken: () => Promise.resolve(token.accessToken),
      invalidate: () => undefined,
    },
    fetch: deps.fetch,
    ...signalOption(deps.signal),
  });
  return {
    refreshToken: token.refreshToken,
    username: await new PinterestApi(client).username(),
  };
}
