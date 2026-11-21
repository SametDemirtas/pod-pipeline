import {
  AI_PROVIDERS,
  SIGN_IN_SERVICES,
  type AiProvider,
  type CancelSignInRequest,
  type ConnectAiRequest,
  type ConnectionsDto,
  type ConnectPrintfulRequest,
  type ConnectSignInRequest,
  type DisconnectRequest,
  type DropboxAuthorizationDto,
  type FinishDropboxRequest,
  type SignInService,
  type StartDropboxRequest,
} from '@pod/contracts';
import type { Clock } from '@pod/core';
import { ConnectionInProgressError } from '../errors/connection-errors.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import { BrowserSignIns } from './browser-sign-ins.js';
import { checked } from './checked.js';
import type { ConnectionChecks, SignInAccess, SignInApp } from './connection-checks.js';
import type {
  ConnectedService,
  ConnectionSecrets,
  ForgettableSecret,
  S3Secret,
} from './connection-secrets.js';
import { DropboxConnection } from './dropbox-connection.js';
import type { FulfilmentStoreMismatch } from '../listing/fulfilment-store-mismatch.js';
import { PrintfulConnection } from './printful-connection.js';

/** Why a sign-in stopped when the seller pressed Cancel, whatever step it was at. */
const SIGN_IN_CANCELLED = 'the sign-in was cancelled';

/** What disconnecting a service does: drop a connection begun in steps, then its secret. */
interface DisconnectTarget extends ForgettableSecret {
  cancel?(): void;
}

/** What the window is told about each stored sign-in. */
const SIGN_IN_SUMMARIES: {
  readonly [S in SignInService]: (
    signIn: SignInApp<S> & SignInAccess<S>,
  ) => NonNullable<ConnectionsDto[S]>;
} = {
  etsy: ({ shopName }) => ({ shopName }),
  pinterest: ({ username }) => ({ username }),
};

export interface ConnectionsServiceDeps {
  readonly secrets: ConnectionSecrets;
  readonly checks: ConnectionChecks;
  readonly openExternal: (url: string) => Promise<void>;
  readonly clock: Clock;
}

/** Connects and disconnects the outside services; only the desktop window may call it. */
export class ConnectionsService {
  private readonly printful: PrintfulConnection;
  private readonly dropbox: DropboxConnection;
  private readonly disconnectTargets: Readonly<Record<ConnectedService, DisconnectTarget>>;
  private readonly signIns = new BrowserSignIns();
  // One change at a time, so a double click or two windows cannot interleave writes.
  private readonly runner = new ExclusiveRunner(() => new ConnectionInProgressError());

  constructor(private readonly deps: ConnectionsServiceDeps) {
    this.printful = new PrintfulConnection({
      secrets: deps.secrets,
      lookup: deps.checks.printful,
      now: () => deps.clock.now().getTime(),
      change: (run) => this.runner.run(run),
    });
    this.dropbox = new DropboxConnection(deps.secrets.fileHosts.dropbox, deps.checks.dropbox);
    const targets = Object.fromEntries(
      Object.entries(deps.secrets.connected).map(([service, secret]) => [
        service,
        { forget: () => secret.forget() },
      ]),
    ) as Record<ConnectedService, DisconnectTarget>;
    // A code a file host shows for a connection begun before must not connect it again.
    const fileHost = {
      ...targets.fileHost,
      cancel: () => {
        this.dropbox.cancel();
      },
    };
    this.disconnectTargets = { ...targets, fileHost };
  }

  async get(): Promise<ConnectionsDto> {
    const { secrets } = this.deps;
    const reconnect = secrets.unsavedSignIns.list();
    const [printful, fileHost, signIns, ai] = await Promise.all([
      secrets.printful.get(),
      secrets.activeFileHost(),
      this.signInSummaries(),
      Promise.all(
        AI_PROVIDERS.map(async (provider) => [
          provider,
          (await secrets.ai[provider].get()) !== undefined,
        ]),
      ),
    ]);
    return {
      printful: await this.printful.status(printful, signIns.etsy?.shopName),
      fileHost,
      ...signIns,
      ai: Object.fromEntries(ai) as Record<AiProvider, boolean>,
      ...(reconnect.length > 0 && { reconnect }),
    };
  }

  connectPrintful({ token }: ConnectPrintfulRequest): Promise<ConnectionsDto> {
    return this.change(() => this.printful.connect(token));
  }

  /** Why the fulfilment store cannot take the marketplace shop's listings; `null` when it looks right. */
  fulfilmentStoreMismatch(): Promise<FulfilmentStoreMismatch | null> {
    return this.printful.mismatch();
  }

  startDropbox({ appKey }: StartDropboxRequest): Promise<DropboxAuthorizationDto> {
    return this.runner.run(async () => {
      this.deps.secrets.assertWritable();
      const authorizeUrl = this.dropbox.start(appKey);
      await this.deps.openExternal(authorizeUrl);
      return { authorizeUrl };
    });
  }

  finishDropbox({ code }: FinishDropboxRequest): Promise<ConnectionsDto> {
    return this.runner.run(async () => {
      await this.dropbox.finish(code);
      return this.get();
    });
  }

  connectS3(secret: S3Secret): Promise<ConnectionsDto> {
    return this.change(async () => {
      await checked('s3', () => this.deps.checks.s3(secret));
      await this.deps.secrets.fileHosts.s3.save(secret);
    });
  }

  connectAi({ provider, apiKey }: ConnectAiRequest): Promise<ConnectionsDto> {
    return this.change(async () => {
      await checked(provider, () => this.deps.checks.aiKey(provider, apiKey));
      await this.deps.secrets.ai[provider].save({ apiKey });
    });
  }

  connectSignIn({ service, ...app }: ConnectSignInRequest): Promise<ConnectionsDto> {
    return this.signInInBrowser(service, app);
  }

  /** Stops waiting for the browser, so the seller can start again or change something else. */
  cancelSignIn({ service }: CancelSignInRequest): Promise<ConnectionsDto> {
    this.signIns.cancel(service);
    return this.get();
  }

  disconnect({ service }: DisconnectRequest): Promise<ConnectionsDto> {
    return this.runner.run(async () => {
      const target = this.disconnectTargets[service];
      target.cancel?.();
      await target.forget();
      return this.get();
    });
  }

  /** Cancels sign-ins waiting in the browser and resolves once no change runs. */
  close(): Promise<void> {
    this.signIns.cancelAll();
    return this.runner.close();
  }

  /** What the window is told about every service the seller signs in to in the browser. */
  private async signInSummaries(): Promise<Pick<ConnectionsDto, SignInService>> {
    const summaries = await Promise.all(
      SIGN_IN_SERVICES.map(async (service) => [service, await this.signInSummary(service)]),
    );
    return Object.fromEntries(summaries) as Pick<ConnectionsDto, SignInService>;
  }

  private async signInSummary<S extends SignInService>(service: S): Promise<ConnectionsDto[S]> {
    const signIn = await this.deps.secrets.signIns[service].get();
    return signIn ? SIGN_IN_SUMMARIES[service](signIn) : null;
  }

  /** Stores a new connection once the keychain can protect it, then tells what is connected. */
  private change(connect: () => Promise<void>): Promise<ConnectionsDto> {
    return this.runner.run(async () => {
      this.deps.secrets.assertWritable();
      await connect();
      return this.get();
    });
  }

  /** Waits for the seller to allow access in the browser, then stores the sign-in. */
  private signInInBrowser<S extends SignInService>(
    service: S,
    app: SignInApp<S>,
  ): Promise<ConnectionsDto> {
    const signIn = this.deps.checks.signIns[service];
    return this.change(async () => {
      const access = await checked(service, () =>
        this.signIns.run(
          service,
          (signal) => signIn(app, this.deps.openExternal, signal),
          () => new Error(SIGN_IN_CANCELLED),
        ),
      );
      await this.deps.secrets.signIns[service].save({ ...app, ...access });
    });
  }
}
