import { asVendor } from './errors.js';
import { openAiClient } from './openai-client.js';
import type { OpenAiVendor } from './vendors.js';

/** Lists the models, which any working key may do and which costs nothing. */
export async function checkOpenAiCompatibleKey(
  vendor: OpenAiVendor,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<void> {
  const client = openAiClient(vendor, apiKey, { timeout: 30_000, maxRetries: 0, fetch: fetchFn });
  await asVendor(vendor, () => client.models.list());
}
