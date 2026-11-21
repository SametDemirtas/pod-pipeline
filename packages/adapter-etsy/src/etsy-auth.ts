import { oauthRefusal, requestOAuthToken } from '@pod/adapter-http';
import { EtsyApiError, UnexpectedEtsyResponseError } from './errors.js';

const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
export const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

/** Reading and writing listings, removing a half-made draft, and reading shop settings. */
const ETSY_SCOPES = ['listings_r', 'listings_w', 'listings_d', 'shops_r'] as const;

/** The seller adds this address to their Etsy app; the app listens on it only while signing in. */
export const ETSY_REDIRECT_PORT = 3003;
export const ETSY_REDIRECT_PATH = '/oauth/redirect';
export const ETSY_REDIRECT_URI = `http://localhost:${ETSY_REDIRECT_PORT}${ETSY_REDIRECT_PATH}`;

export interface EtsyAuthorization {
  readonly keystring: string;
  readonly codeChallenge: string;
  readonly state: string;
}

export interface EtsyToken {
  readonly accessToken: string;
  /** Etsy hands out a new refresh token with every access token; the old one stops working. */
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
}

export function etsyAuthorizeUrl({ keystring, codeChallenge, state }: EtsyAuthorization): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: keystring,
    redirect_uri: ETSY_REDIRECT_URI,
    scope: ETSY_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface EtsyCodeExchange {
  readonly keystring: string;
  readonly code: string;
  readonly codeVerifier: string;
}

export function exchangeEtsyCode(
  exchange: EtsyCodeExchange,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<EtsyToken> {
  return requestEtsyToken(
    fetchFn,
    {
      grant_type: 'authorization_code',
      client_id: exchange.keystring,
      redirect_uri: ETSY_REDIRECT_URI,
      code: exchange.code,
      code_verifier: exchange.codeVerifier,
    },
    signal,
  );
}

export function refreshEtsyToken(
  keystring: string,
  refreshToken: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<EtsyToken> {
  return requestEtsyToken(
    fetchFn,
    { grant_type: 'refresh_token', client_id: keystring, refresh_token: refreshToken },
    signal,
  );
}

async function requestEtsyToken(
  fetchFn: typeof fetch,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<EtsyToken> {
  const token = await requestOAuthToken(fetchFn, {
    url: ETSY_TOKEN_URL,
    form,
    ...(signal === undefined ? {} : { signal }),
    refused: oauthRefusal({
      ApiError: EtsyApiError,
      UnexpectedResponseError: UnexpectedEtsyResponseError,
    }),
  });
  if (token.refreshToken === null) {
    throw new UnexpectedEtsyResponseError('token response without a refresh token');
  }
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    // Etsy's access tokens last an hour; assuming so avoids refreshing on every call.
    expiresInSeconds: token.expiresInSeconds ?? 3600,
  };
}
