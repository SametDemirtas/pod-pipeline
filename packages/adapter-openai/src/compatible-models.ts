import { KeyedModelChoice, type KeyedAccess } from '@pod/adapter-ai';
import { sdkSettings } from '@pod/adapter-http';
import { CompatibleJsonModel } from './compatible-json-model.js';
import { OpenAiNotConnectedError } from './errors.js';
import { openAiClient } from './openai-client.js';
import type { OpenAiVendor } from './vendors.js';

export type OpenAiAccess = KeyedAccess;

/** The vendor's model the seller chose, with the key saved at the moment of asking. */
export class CompatibleModels extends KeyedModelChoice<CompatibleJsonModel> {
  constructor(
    private readonly vendor: OpenAiVendor,
    private readonly access: OpenAiAccess,
  ) {
    super(access);
  }

  protected notConnected(): Error {
    return new OpenAiNotConnectedError(this.vendor);
  }

  protected modelFor(apiKey: string, model: string): CompatibleJsonModel {
    const client = openAiClient(
      this.vendor,
      apiKey,
      sdkSettings({
        timeout: 120_000,
        // A long spinner is worse than a quick error the seller can retry.
        retries: 1,
        fetch: this.access.fetch,
      }),
    );
    return new CompatibleJsonModel(client, this.vendor, model);
  }
}
