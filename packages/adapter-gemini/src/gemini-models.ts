import { KeyedModelChoice, type KeyedAccess } from '@pod/adapter-ai';
import { GeminiNotConnectedError } from './errors.js';
import { GeminiJsonModel } from './gemini-json-model.js';

export interface GeminiAccess extends KeyedAccess {
  /** Waits before a request is tried again; a timer by default. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** The Gemini model the seller chose, with the key saved at the moment of asking. */
export class GeminiModels extends KeyedModelChoice<GeminiJsonModel> {
  constructor(private readonly access: GeminiAccess) {
    super(access);
  }

  protected notConnected(): Error {
    return new GeminiNotConnectedError();
  }

  protected modelFor(apiKey: string, model: string): GeminiJsonModel {
    return new GeminiJsonModel(this.access.fetch ?? fetch, apiKey, model, this.access.sleep);
  }
}
