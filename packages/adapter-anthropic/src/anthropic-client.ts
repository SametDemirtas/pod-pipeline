import Anthropic from '@anthropic-ai/sdk';
import type { SdkClientSettings } from '@pod/adapter-http';

const API = 'https://api.anthropic.com';

/**
 * The official SDK with the seller's key, always talking to Anthropic. The SDK
 * reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` for unset options, which
 * could send the key elsewhere, so both are set.
 */
export function anthropicClient(apiKey: string, settings: SdkClientSettings): Anthropic {
  const { fetch: fetchFn, ...rest } = settings;
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: API,
    ...rest,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
}
