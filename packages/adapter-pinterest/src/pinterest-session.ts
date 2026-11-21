import { RotatingTokenSession, type ServiceSessionOptions } from '@pod/adapter-http';
import { refreshPinterestToken, type PinterestApp } from './pinterest-auth.js';
import { PinterestNotConnectedError } from './errors.js';

export interface PinterestCredentials extends PinterestApp {
  readonly refreshToken: string;
}

export type PinterestSessionOptions = ServiceSessionOptions<PinterestCredentials>;

/** Hands out access tokens for the seller's Pinterest sign-in. */
export class PinterestSession extends RotatingTokenSession<PinterestCredentials> {
  constructor(options: PinterestSessionOptions) {
    super({
      ...options,
      refresh: (credentials, refreshToken) =>
        refreshPinterestToken(credentials, refreshToken, options.fetch),
      notConnected: () => new PinterestNotConnectedError(),
    });
  }
}
