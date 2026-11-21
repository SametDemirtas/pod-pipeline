import type { ServiceErrors } from './service-errors.js';
import { parseJson } from '@pod/core';
import { withTimeout } from './timeout-signal.js';

export interface OAuthToken {
  readonly accessToken: string;
  /** `null` when the service keeps the refresh token it was asked with. */
  readonly refreshToken: string | null;
  readonly expiresInSeconds: number | null;
}

export interface OAuthRefusal {
  readonly status: number;
  /** OAuth error code, e.g. `invalid_grant`. */
  readonly code: string | undefined;
  /** The service's own explanation, when it gave one. */
  readonly description: string | undefined;
}

export interface OAuthTokenRequest {
  readonly url: string;
  readonly form: Readonly<Record<string, string>>;
  /** E.g. Basic authentication with an app id and secret. */
  readonly authorization?: string;
  readonly signal?: AbortSignal;
  /** The service's error for a refused request or an answer without an access token. */
  readonly refused: (refusal: OAuthRefusal) => Error;
}

const TIMEOUT_MS = 30_000;

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** Sends an OAuth form to a token endpoint and reads the token from the answer. */
export async function requestOAuthToken(
  fetchFn: typeof fetch,
  request: OAuthTokenRequest,
): Promise<OAuthToken> {
  const response = await fetchFn(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(request.authorization ? { Authorization: request.authorization } : {}),
    },
    body: new URLSearchParams(request.form).toString(),
    signal: withTimeout(request.signal, TIMEOUT_MS),
  });
  const parsed = parseJson(await response.text());
  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const accessToken = text(body['access_token']);
  if (!response.ok || !accessToken) {
    throw request.refused({
      status: response.status,
      code: text(body['error']),
      description: text(body['error_description']) ?? text(body['message']),
    });
  }
  return {
    accessToken,
    refreshToken: text(body['refresh_token']) ?? null,
    expiresInSeconds: typeof body['expires_in'] === 'number' ? body['expires_in'] : null,
  };
}

/**
 * The usual {@link OAuthTokenRequest.refused}: an answer without a token is
 * unexpected, a refusal the service's API error with its OAuth code.
 */
export function oauthRefusal(
  errors: Pick<ServiceErrors, 'ApiError' | 'UnexpectedResponseError'>,
): (refusal: OAuthRefusal) => Error {
  return ({ status, code, description }) =>
    status < 300
      ? new errors.UnexpectedResponseError('token response without an access token')
      : new errors.ApiError(status, description ?? code ?? 'sign-in failed', code);
}
