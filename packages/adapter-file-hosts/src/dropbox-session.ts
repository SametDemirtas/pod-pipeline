import { RotatingTokenSession } from '@pod/adapter-http';
import type { Clock } from '@pod/core';
import { requestDropboxToken } from './dropbox-auth.js';
import { FileHostNotConnectedError } from './errors.js';
import type { SignalFor } from './timeouts.js';

export interface DropboxCredentials {
  readonly appKey: string;
  readonly refreshToken: string;
}

/** Short-lived Dropbox access tokens from the stored refresh token, which Dropbox keeps. */
export function dropboxSession(
  credentials: () => Promise<DropboxCredentials | undefined>,
  fetchFn: typeof fetch,
  clock: Clock,
  signal: SignalFor,
): RotatingTokenSession<DropboxCredentials> {
  return new RotatingTokenSession({
    credentials,
    refresh: async ({ appKey }, refreshToken) => {
      const token = await requestDropboxToken(
        fetchFn,
        { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: appKey },
        signal('request'),
      );
      return {
        accessToken: token.accessToken,
        refreshToken: null,
        expiresInSeconds: token.expiresInSeconds,
      };
    },
    // Dropbox refresh tokens do not change.
    saveRefreshToken: () => Promise.resolve(),
    clock,
    notConnected: () => new FileHostNotConnectedError('dropbox'),
  });
}
