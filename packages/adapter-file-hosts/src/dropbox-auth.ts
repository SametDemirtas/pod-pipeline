import { requestOAuthToken } from '@pod/adapter-http';
import { FileHostRequestError, FileHostUnexpectedResponseError } from './errors.js';
import { defaultSignal } from './timeouts.js';

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
export const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

/** Dropbox access tokens last four hours. */
const DEFAULT_EXPIRES_IN_SECONDS = 14_400;

export interface DropboxToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly refreshToken: string | undefined;
}

/** Without a redirect address Dropbox shows the code to the user, who pastes it into the app. */
export function dropboxAuthorizeUrl(appKey: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    token_access_type: 'offline',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface DropboxCodeExchange {
  readonly appKey: string;
  readonly code: string;
  readonly codeVerifier: string;
}

/** Trades the pasted code for the long-lived refresh token the app stores. */
export async function exchangeDropboxCode(
  exchange: DropboxCodeExchange,
  fetchFn: typeof fetch,
): Promise<string> {
  const token = await requestDropboxToken(fetchFn, {
    grant_type: 'authorization_code',
    code: exchange.code.trim(),
    client_id: exchange.appKey,
    code_verifier: exchange.codeVerifier,
  });
  if (!token.refreshToken) {
    throw new FileHostUnexpectedResponseError('dropbox', 'token response without a refresh token');
  }
  return token.refreshToken;
}

export async function requestDropboxToken(
  fetchFn: typeof fetch,
  form: Record<string, string>,
  signal: AbortSignal = defaultSignal('request'),
): Promise<DropboxToken> {
  const token = await requestOAuthToken(fetchFn, {
    url: DROPBOX_TOKEN_URL,
    form,
    signal,
    refused: ({ status, code }) =>
      status < 300
        ? new FileHostUnexpectedResponseError('dropbox', 'token response without an access token')
        : new FileHostRequestError('dropbox', status, code),
  });
  return {
    accessToken: token.accessToken,
    expiresInSeconds: token.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
    refreshToken: token.refreshToken ?? undefined,
  };
}
