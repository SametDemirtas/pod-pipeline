import type { ConnectionsDto, FulfilmentStoreProblem } from '@pod/contracts';
import type { ConnectionSecrets, PrintfulSecret } from './connection-secrets.js';
import { checked } from './checked.js';
import {
  fulfilmentStoreProblem,
  type FulfilmentStore,
  type FulfilmentStoreLookup,
} from './fulfilment-store.js';
import { FulfilmentStoreCache } from './fulfilment-store-cache.js';
import type { FulfilmentStoreMismatch } from '../listing/fulfilment-store-mismatch.js';

export interface PrintfulConnectionDeps {
  readonly secrets: Pick<ConnectionSecrets, 'printful' | 'signIns'>;
  readonly lookup: FulfilmentStoreLookup;
  readonly now: () => number;
  /** Runs a change of the stored secrets when no other change runs. */
  readonly change: (run: () => Promise<void>) => Promise<void>;
}

/** Connects Printful with a token and tells whether its store fits the Etsy shop. */
export class PrintfulConnection {
  private readonly stores: FulfilmentStoreCache;

  constructor(private readonly deps: PrintfulConnectionDeps) {
    this.stores = new FulfilmentStoreCache({
      lookup: deps.lookup,
      now: deps.now,
      keep: (secret, store) => this.keepStoreKind(secret, store),
    });
  }

  async connect(token: string): Promise<void> {
    const store = await checked('printful', () => this.deps.lookup(token));
    await this.deps.secrets.printful.save({
      token,
      storeName: store.name,
      storeSyncsWithMarketplace: store.syncsWithMarketplace,
      storeShopHandle: store.shopHandle,
    });
  }

  /** The connected store as the window shows it, given the Etsy shop's name. */
  async status(
    secret: PrintfulSecret | undefined,
    shopName: string | undefined,
  ): Promise<ConnectionsDto['printful']> {
    if (!secret) return null;
    const problem = await this.problem(secret, shopName);
    return { storeName: secret.storeName, ...(problem ? { storeProblem: problem } : {}) };
  }

  /**
   * Why the Printful store cannot take the Etsy shop's listings, e.g. after
   * Printful did not import one; `null` when it looks right, or either is not
   * connected, or Printful cannot be asked.
   */
  async mismatch(): Promise<FulfilmentStoreMismatch | null> {
    const [printful, etsy] = await Promise.all([
      this.deps.secrets.printful.get(),
      this.deps.secrets.signIns.etsy.get(),
    ]);
    if (!printful || !etsy) return null;
    const problem = await this.problem(printful, etsy.shopName);
    return problem && { problem, storeName: printful.storeName, shopName: etsy.shopName };
  }

  private async problem(
    secret: PrintfulSecret,
    shopName: string | undefined,
  ): Promise<FulfilmentStoreProblem | null> {
    const store = await this.stores.storeOf(secret);
    return store && fulfilmentStoreProblem(store, shopName);
  }

  private keepStoreKind(secret: PrintfulSecret, store: FulfilmentStore): Promise<void> {
    return this.deps.change(async () => {
      const current = await this.deps.secrets.printful.get();
      // Unless the token was replaced or forgotten meanwhile.
      if (current?.token !== secret.token || current.storeSyncsWithMarketplace !== undefined)
        return;
      await this.deps.secrets.printful.save({
        ...current,
        storeSyncsWithMarketplace: store.syncsWithMarketplace,
        storeShopHandle: store.shopHandle,
      });
    });
  }
}
