import { oauthRefusal, requestOAuthToken } from '@pod/adapter-http';
import { PinterestApiError, UnexpectedPinterestResponseError } from './errors.js';

const AUTHORIZE_URL = 'https://www.pinterest.com/oauth/';
const PINTEREST_TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';

/** Reading boards to pick one, creating pins on them, and the account name to show. */
const PINTEREST_SCOPES = ['boards:read', 'pins:write', 'user_accounts:read'] as const;

/** The seller adds this address to their Pinterest app; the app listens on it only while signing in. */
export const PINTEREST_REDIRECT_PORT = 3004;
export const PINTEREST_REDIRECT_PATH = '/oauth/redirect';
export const PINTEREST_REDIRECT_URI = `http://localhost:${PINTEREST_REDIRECT_PORT}${PINTEREST_REDIRECT_PATH}`;

/** The seller's own Pinterest app. */
export interface PinterestApp {
  readonly appId: string;
  readonly appSecret: string;
}

export interface PinterestToken {
  readonly accessToken: string;
  /** Pinterest may hand out a new refresh token; `null` keeps the one that was used. */
  readonly refreshToken: string | null;
  readonly expiresInSeconds: number;
}

export function pinterestAuthorizeUrl(appId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: PINTEREST_REDIRECT_URI,
    response_type: 'code',
    scope: PINTEREST_SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function exchangePinterestCode(
  app: PinterestApp,
  code: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<PinterestToken> {
  return requestPinterestToken(
    app,
    fetchFn,
    { grant_type: 'authorization_code', code, redirect_uri: PINTEREST_REDIRECT_URI },
    signal,
  );
}

export function refreshPinterestToken(
  app: PinterestApp,
  refreshToken: string,
  fetchFn: typeof fetch,
): Promise<PinterestToken> {
  return requestPinterestToken(app, fetchFn, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

async function requestPinterestToken(
  app: PinterestApp,
  fetchFn: typeof fetch,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<PinterestToken> {
  const token = await requestOAuthToken(fetchFn, {
    url: PINTEREST_TOKEN_URL,
    form,
    authorization: `Basic ${Buffer.from(`${app.appId}:${app.appSecret}`).toString('base64')}`,
    ...(signal === undefined ? {} : { signal }),
    refused: oauthRefusal({
      ApiError: PinterestApiError,
      UnexpectedResponseError: UnexpectedPinterestResponseError,
    }),
  });
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    // Pinterest's access tokens last 30 days; a day is a safe guess when it does not say.
    expiresInSeconds: token.expiresInSeconds ?? 86_400,
  };
}
