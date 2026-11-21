import { KeyedModelChoice, type KeyedAccess } from '@pod/adapter-ai';
import { sdkSettings } from '@pod/adapter-http';
import { anthropicClient } from './anthropic-client.js';
import { ClaudeJsonModel } from './claude-json-model.js';
import { AnthropicNotConnectedError } from './errors.js';

export type ClaudeAccess = KeyedAccess;

/** The Claude model the seller chose, with the key saved at the moment of asking. */
export class ClaudeModels extends KeyedModelChoice<ClaudeJsonModel> {
  constructor(private readonly access: ClaudeAccess) {
    super(access);
  }

  protected notConnected(): Error {
    return new AnthropicNotConnectedError();
  }

  protected modelFor(apiKey: string, model: string): ClaudeJsonModel {
    const client = anthropicClient(
      apiKey,
      sdkSettings({
        timeout: 120_000,
        // A long spinner is worse than a quick error the seller can retry.
        retries: 1,
        fetch: this.access.fetch,
      }),
    );
    return new ClaudeJsonModel(client, model);
  }
}
