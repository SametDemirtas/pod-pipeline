import { anthropicClient } from './anthropic-client.js';

/** Lists one model, which any working key may do and which costs nothing; asks once. */
export async function checkAnthropicKey(apiKey: string, fetchFn?: typeof fetch): Promise<void> {
  const client = anthropicClient(apiKey, { timeout: 30_000, maxRetries: 0, fetch: fetchFn });
  await client.models.list({ limit: 1 });
}
