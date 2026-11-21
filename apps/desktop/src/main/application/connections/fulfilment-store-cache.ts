import type { PrintfulSecret } from './connection-secrets.js';
import type { FulfilmentStore, FulfilmentStoreLookup } from './fulfilment-store.js';

/** How long a failed question about a saved token's store is not asked again. */
const STORE_RETRY_MS = 60_000;

export interface FulfilmentStoreCacheDeps {
  readonly lookup: FulfilmentStoreLookup;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
  /**
   * Keeps what Printful said with the token, so it is not asked at every
   * start; rejects when it cannot now, e.g. while another change runs.
   */
  readonly keep: (secret: PrintfulSecret, store: FulfilmentStore) => Promise<void>;
}

/** Stores of tokens saved before the app kept the store's kind, asked once each run. */
export class FulfilmentStoreCache {
  private readonly asked = new Map<string, Promise<FulfilmentStore | null>>();
  /** When asking about a token's store last failed, so it is not asked at every read. */
  private readonly failures = new Map<string, number>();
  /** Tokens whose store was found but not kept yet, kept at their next read. */
  private readonly unkept = new Set<string>();

  constructor(private readonly deps: FulfilmentStoreCacheDeps) {}

  /** The store as saved, or as Printful describes it; `null` while Printful cannot be asked. */
  storeOf(secret: PrintfulSecret): Promise<FulfilmentStore | null> {
    if (secret.storeSyncsWithMarketplace !== undefined) {
      return Promise.resolve({
        name: secret.storeName,
        syncsWithMarketplace: secret.storeSyncsWithMarketplace,
        shopHandle: secret.storeShopHandle ?? null,
      });
    }
    const { token } = secret;
    const asked = this.asked.get(token);
    if (asked) {
      if (this.unkept.has(token)) {
        void asked.then((found) => {
          if (found) this.persist(secret, found);
        });
      }
      return asked;
    }
    const failed = this.failures.get(token);
    if (failed !== undefined && this.deps.now() - failed < STORE_RETRY_MS) {
      return Promise.resolve(null);
    }
    const store = this.deps.lookup(token).then(
      (found) => {
        this.failures.delete(token);
        this.persist(secret, found);
        return found;
      },
      () => {
        // Asked again after a while, so a moment offline does not hide the problem for good.
        this.asked.delete(token);
        this.failures.set(token, this.deps.now());
        return null;
      },
    );
    this.asked.set(token, store);
    return store;
  }

  private persist(secret: PrintfulSecret, store: FulfilmentStore): void {
    this.unkept.delete(secret.token);
    this.deps.keep(secret, store).catch(() => {
      this.unkept.add(secret.token);
    });
  }
}
