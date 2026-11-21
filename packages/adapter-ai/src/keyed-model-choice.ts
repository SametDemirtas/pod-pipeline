import type { JsonModel, ModelChoice } from './json-model.js';

/** A service's saved key and the model the seller chose there. */
export interface KeyedAccess {
  /** Resolves to `undefined` while no key is saved. */
  readonly apiKey: () => Promise<string | undefined>;
  /** The model id the seller chose, e.g. `claude-opus-5-5`. */
  readonly model: () => Promise<string>;
  /** The global fetch by default. */
  readonly fetch?: typeof fetch;
}

/** The model the seller chose at a service, with the key saved at the moment of asking. */
export abstract class KeyedModelChoice<M extends JsonModel> implements ModelChoice {
  constructor(private readonly keyed: KeyedAccess) {}

  async current(): Promise<M> {
    const apiKey = await this.keyed.apiKey();
    if (!apiKey) throw this.notConnected();
    return this.modelFor(apiKey, await this.keyed.model());
  }

  /** The error for a service whose key is not saved. */
  protected abstract notConnected(): Error;

  protected abstract modelFor(apiKey: string, model: string): M;
}
