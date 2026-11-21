import type { AiProvider, SignInAppRequest, SignInService } from '@pod/contracts';
import type { S3Secret } from './connection-secrets.js';
import type { DropboxChecks } from './dropbox-connection.js';
import type { FulfilmentStoreLookup } from './fulfilment-store.js';

export type EtsyApp = SignInAppRequest<'etsy'>;

export interface EtsyAccess {
  readonly refreshToken: string;
  readonly shopId: string;
  readonly shopName: string;
}

export interface PinterestAccess {
  readonly refreshToken: string;
  readonly username: string;
}

/** What the seller enters to sign in on each service, and what allowing access there returns. */
interface SignInShapes {
  readonly etsy: { readonly app: EtsyApp; readonly access: EtsyAccess };
  readonly pinterest: {
    readonly app: SignInAppRequest<'pinterest'>;
    readonly access: PinterestAccess;
  };
}

export type SignInApp<S extends SignInService> = SignInShapes[S]['app'];
export type SignInAccess<S extends SignInService> = SignInShapes[S]['access'];

/** Signs in on a service in the browser; resolves once the seller allowed access there. */
type BrowserSignIn<App, Access> = (
  app: App,
  openExternal: (url: string) => Promise<void>,
  signal: AbortSignal,
) => Promise<Access>;

/** The browser sign-in of each service the app renews the sign-in of. */
type SignInChecks = {
  readonly [S in SignInService]: BrowserSignIn<SignInApp<S>, SignInAccess<S>>;
};

/** What connecting each service checks with that service before anything is stored. */
export interface ConnectionChecks {
  readonly printful: FulfilmentStoreLookup;
  readonly dropbox: DropboxChecks;
  /** Uploads and removes a small test file. */
  readonly s3: (secret: S3Secret) => Promise<void>;
  /** Resolves when the AI service accepts the key. */
  readonly aiKey: (provider: AiProvider, apiKey: string) => Promise<void>;
  readonly signIns: SignInChecks;
}
