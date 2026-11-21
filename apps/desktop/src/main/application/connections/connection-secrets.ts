import { z } from 'zod';
import {
  AI_PROVIDERS,
  FILE_HOST_KINDS,
  SIGN_IN_SERVICES,
  type AiProvider,
  type DisconnectRequest,
  type FileHostKind,
  type SignInService,
} from '@pod/contracts';
import type { SignInAccess, SignInApp } from './connection-checks.js';
import type { SecretName, SecretStore } from './secret-store.js';
import { RotatingSecretSlot, SecretSlot } from './secret-slot.js';
import { UnsavedSignIns } from './unsaved-sign-ins.js';

const printfulSecret = z.object({
  token: z.string().min(1),
  storeName: z.string(),
  /**
   * Whether the store syncs with the marketplace, `null` when Printful did not
   * say, and the shop in its address; left out in secrets saved before the app
   * kept them, which are then asked about once again.
   */
  storeSyncsWithMarketplace: z.boolean().nullable().optional(),
  storeShopHandle: z.string().nullable().optional(),
});
const dropboxSecret = z.object({ appKey: z.string().min(1), refreshToken: z.string().min(1) });
const etsySecret = z.object({
  keystring: z.string().min(1),
  sharedSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  shopId: z.string().min(1),
  shopName: z.string(),
});
const apiKeySecret = z.object({ apiKey: z.string().min(1) });
const pinterestSecret = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  username: z.string(),
});
const s3Secret = z.object({
  endpoint: z.string().min(1),
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});

export type PrintfulSecret = z.infer<typeof printfulSecret>;
export type S3Secret = z.infer<typeof s3Secret>;
type ApiKeySecret = z.infer<typeof apiKeySecret>;

interface FileHostSecrets {
  readonly dropbox: z.infer<typeof dropboxSecret>;
  readonly s3: S3Secret;
}

/** What a stored sign-in holds: the seller's app and the access it was given. */
type SignInSecret<S extends SignInService> = SignInApp<S> & SignInAccess<S>;

const FILE_HOST_SECRETS: { readonly [K in FileHostKind]: z.ZodType<FileHostSecrets[K]> } = {
  dropbox: dropboxSecret,
  s3: s3Secret,
};
const SIGN_IN_SECRETS: { readonly [S in SignInService]: z.ZodType<SignInSecret<S>> } = {
  etsy: etsySecret,
  pinterest: pinterestSecret,
};

/** The stored secret of each file host; only one is stored at a time. */
type FileHostSlots = { readonly [K in FileHostKind]: SecretSlot<FileHostSecrets[K]> };

/** The stored sign-in of each service the seller signs in to in the browser. */
type SignInSlots = { readonly [S in SignInService]: RotatingSecretSlot<SignInSecret<S>> };

/** A service the seller can disconnect; the file host is whichever one is stored. */
export type ConnectedService = DisconnectRequest['service'];

/** A stored connection that can be dropped. */
export interface ForgettableSecret {
  forget(): Promise<void>;
}

/** Typed access to every service's stored secret. */
export class ConnectionSecrets {
  readonly printful: SecretSlot<PrintfulSecret>;
  /** Saving one file host forgets the others in the same write. */
  readonly fileHosts: FileHostSlots;
  readonly signIns: SignInSlots;
  /** Each AI service has its own API key; Gemini's serves text and scene photos alike. */
  readonly ai: Readonly<Record<AiProvider, SecretSlot<ApiKeySecret>>>;
  /** Sign-ins renewed but not stored; storing or forgetting the sign-in settles them. */
  readonly unsavedSignIns = new UnsavedSignIns();
  /** The stored secret of each service the seller can disconnect. */
  readonly connected: Readonly<Record<ConnectedService, ForgettableSecret>>;

  constructor(private readonly file: SecretStore) {
    const others = (kind: FileHostKind) => FILE_HOST_KINDS.filter((other) => other !== kind);
    this.printful = new SecretSlot(file, 'printful', printfulSecret);
    const fileHost = <K extends FileHostKind>(kind: K) =>
      new SecretSlot<FileHostSecrets[K]>(file, kind, FILE_HOST_SECRETS[kind], others(kind));
    const signIn = <S extends SignInService>(service: S) =>
      new RotatingSecretSlot<SignInSecret<S>>(
        file,
        service,
        SIGN_IN_SECRETS[service],
        this.unsavedSignIns,
      );
    this.fileHosts = Object.fromEntries(
      FILE_HOST_KINDS.map((kind) => [kind, fileHost(kind)]),
    ) as FileHostSlots;
    this.signIns = Object.fromEntries(
      SIGN_IN_SERVICES.map((service) => [service, signIn(service)]),
    ) as SignInSlots;
    this.ai = Object.fromEntries(
      AI_PROVIDERS.map((provider) => [provider, new SecretSlot(file, provider, apiKeySecret)]),
    ) as Record<AiProvider, SecretSlot<ApiKeySecret>>;
    const names: readonly SecretName[] = FILE_HOST_KINDS;
    const fileHosts = { forget: () => file.update({ remove: names }) };
    this.connected = { printful: this.printful, fileHost: fileHosts, ...this.signIns, ...this.ai };
  }

  /** Throws when the keychain cannot protect new secrets. */
  assertWritable(): void {
    this.file.assertWritable();
  }

  /** The first file host stored, as only an interrupted older version could leave two. */
  async activeFileHost(): Promise<FileHostKind | null> {
    for (const kind of FILE_HOST_KINDS) {
      if (await this.fileHosts[kind].get()) return kind;
    }
    return null;
  }
}
