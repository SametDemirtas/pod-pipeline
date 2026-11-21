import OpenAI from 'openai';
import type { SdkClientSettings } from '@pod/adapter-http';
import type { OpenAiVendor } from './vendors.js';

/**
 * The official SDK pointed at the vendor's API with the seller's key. The SDK
 * fills unset ids and keys from `OPENAI_*` variables, which would reach every
 * vendor, so they are set empty; only `OPENAI_CUSTOM_HEADERS` cannot be turned off.
 */
export function openAiClient(
  vendor: OpenAiVendor,
  apiKey: string,
  settings: SdkClientSettings,
): OpenAI {
  const { fetch: fetchFn, ...rest } = settings;
  return new OpenAI({
    apiKey,
    baseURL: vendor.baseURL,
    organization: null,
    project: null,
    adminAPIKey: null,
    ...rest,
    ...(fetchFn ? { fetch: fetchFn } : {}),
  });
}
