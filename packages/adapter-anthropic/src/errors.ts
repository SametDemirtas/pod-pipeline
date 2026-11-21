/** The name the seller knows the service by, in errors and messages. */
export const CLAUDE = 'Claude';

/** No Anthropic API key has been saved yet. */
export class AnthropicNotConnectedError extends Error {
  constructor() {
    super('Claude is not connected; add an Anthropic API key first');
    this.name = new.target.name;
  }
}
