import { counter, formOf, json, route, type FakeService } from './http.js';

/** The code every consent page hands back. */
export const FAKE_CODE = 'fake-code';

interface TokenIssuer {
  readonly name: string;
  readonly url: string;
  /** Hands out a new refresh token with every refreshed access token, as Etsy does. */
  readonly rotates: boolean;
}

const ISSUERS: readonly TokenIssuer[] = [
  { name: 'etsy', url: 'https://api.etsy.com/v3/public/oauth/token', rotates: true },
  { name: 'pinterest', url: 'https://api.pinterest.com/v5/oauth/token', rotates: false },
  { name: 'dropbox', url: 'https://api.dropboxapi.com/oauth2/token', rotates: false },
];

/** Consent pages; the ones given a `redirect_uri` send the browser back to it. */
const CONSENT_PAGES: readonly FakeService[] = [
  consentPage('https://www.etsy.com/oauth/connect', ''),
  consentPage('https://www.pinterest.com/oauth', '/'),
  consentPage('https://www.dropbox.com/oauth2/authorize', ''),
];

/** Token endpoints that grant codes from the consent pages and any refresh token. */
export function oauthServices(): FakeService[] {
  return [...ISSUERS.map(tokenEndpoint), ...CONSENT_PAGES];
}

function tokenEndpoint({ name, url, rotates }: TokenIssuer): FakeService {
  const next = counter(1);
  return {
    base: url,
    routes: [
      route('POST', '', async (request) => {
        const form = await formOf(request);
        const grant = form.get('grant_type');
        if (grant === 'authorization_code' && form.get('code') === FAKE_CODE) {
          return json(tokens(name, next(), true));
        }
        if (grant === 'refresh_token' && form.get('refresh_token')) {
          return json(tokens(name, next(), rotates));
        }
        return json(
          { error: 'invalid_grant', error_description: 'The code or refresh token is not valid' },
          400,
        );
      }),
    ],
  };
}

function tokens(name: string, serial: number, withRefreshToken: boolean) {
  return {
    access_token: `${name}-access-${String(serial)}`,
    token_type: 'Bearer',
    expires_in: 3600,
    ...(withRefreshToken ? { refresh_token: `${name}-refresh-${String(serial)}` } : {}),
  };
}

function consentPage(base: string, path: string): FakeService {
  return {
    base,
    routes: [
      route('GET', path, (_request, _params, url) => {
        const redirectUri = url.searchParams.get('redirect_uri');
        if (redirectUri) {
          // After answering, as the browser follows the redirect once the page is shown.
          setTimeout(() => {
            redirectBack(redirectUri, url.searchParams.get('state'));
          }, 0);
        }
        return new Response('<!doctype html><title>Allow access</title>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }),
    ],
  };
}

function redirectBack(redirectUri: string, state: string | null): void {
  const target = new URL(redirectUri);
  target.searchParams.set('code', FAKE_CODE);
  if (state !== null) target.searchParams.set('state', state);
  globalThis
    .fetch(target)
    .then((response) => response.body?.cancel())
    .catch(() => undefined);
}
