import { RotatingTokenSession, type ServiceSessionOptions } from '@pod/adapter-http';
import { refreshEtsyToken } from './etsy-auth.js';
import { EtsyNotConnectedError } from './errors.js';

export interface EtsyCredentials {
  /** The seller's own Etsy app: its keystring and shared secret. */
  readonly keystring: string;
  readonly sharedSecret: string;
  readonly refreshToken: string;
  readonly shopId: string;
}

export type EtsySessionOptions = ServiceSessionOptions<EtsyCredentials>;

/**
 * Hands out short-lived access tokens for the seller's sign-in. Etsy replaces
 * the refresh token on every refresh, and the old one stops working.
 */
export class EtsySession extends RotatingTokenSession<EtsyCredentials> {
  constructor(options: EtsySessionOptions) {
    super({
      ...options,
      refresh: (credentials, refreshToken) =>
        refreshEtsyToken(credentials.keystring, refreshToken, options.fetch),
      notConnected: () => new EtsyNotConnectedError(),
    });
  }
}
