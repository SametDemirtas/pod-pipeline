import { MAX_ANSWER_TOKENS, type JsonQuestion, type TextModelCatalog } from '@pod/adapter-ai';
import type OpenAI from 'openai';

/** Request fields that differ between vendors: the answer's length and the model's reasoning. */
export type VendorParams = Pick<
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  'reasoning_effort' | 'max_completion_tokens'
> & {
  /** DeepSeek's name for the answer's limit; the SDK marks it deprecated, which OpenAI's is. */
  readonly max_tokens?: number;
  /** DeepSeek's switch for reasoning, which the SDK's types do not know. */
  readonly thinking?: { readonly type: 'disabled' };
};

/**
 * A service that answers through OpenAI's Chat Completions API, how it differs,
 * and the models suggested to the seller.
 */
export interface OpenAiVendor extends TextModelCatalog {
  /** The name the seller knows the service by. */
  readonly service: string;
  /** The key the seller is asked for, as it reads in a sentence. */
  readonly keyName: string;
  readonly baseURL: string;
  /**
   * `strict` has the API enforce the answer's schema; `prompted` asks for any
   * JSON object and states the schema in the system prompt.
   */
  readonly schema: 'strict' | 'prompted';
  readonly params: (effort: JsonQuestion['effort']) => VendorParams;
  /**
   * Has the service read images in full tiles instead of one small copy, which small
   * print needs; left out for services that do not document the setting.
   */
  readonly highImageDetail?: true;
}

export const OPENAI = {
  service: 'ChatGPT',
  keyName: 'an OpenAI API key',
  baseURL: 'https://api.openai.com/v1',
  schema: 'strict',
  params: (effort) => ({ reasoning_effort: effort, max_completion_tokens: MAX_ANSWER_TOKENS }),
  highImageDetail: true,
  defaultModel: 'gpt-6.1-sol',
  models: [
    { id: 'gpt-6-astra', seesImages: true },
    { id: 'gpt-6.1-sol', seesImages: true },
    { id: 'gpt-6-luna', seesImages: true },
  ],
  defaultCheckModel: 'gpt-6-luna',
  othersSeeImages: true,
} as const satisfies OpenAiVendor;

export const DEEPSEEK = {
  service: 'DeepSeek',
  keyName: 'a DeepSeek API key',
  baseURL: 'https://api.deepseek.com',
  // DeepSeek takes JSON objects, but no schema.
  schema: 'prompted',
  // Reasoning is on by default; these short answers do not need it, so it is turned off.
  params: () => ({ thinking: { type: 'disabled' }, max_tokens: MAX_ANSWER_TOKENS }),
  defaultModel: 'deepseek-flash',
  models: [
    { id: 'deepseek-v4-pro', seesImages: false },
    { id: 'deepseek-flash', seesImages: true },
  ],
  defaultCheckModel: 'deepseek-flash',
  // Only Flash reads images.
  othersSeeImages: false,
} as const satisfies OpenAiVendor;

export const KIMI = {
  service: 'Kimi',
  keyName: 'a Moonshot API key',
  baseURL: 'https://api.moonshot.ai/v1',
  schema: 'strict',
  // K3 models always reason, at `max` unless told otherwise. Kimi has no medium level, and
  // `high` costs far more for answers this short, so every question reasons at `low`.
  params: () => ({ reasoning_effort: 'low', max_completion_tokens: MAX_ANSWER_TOKENS }),
  defaultModel: 'kimi-k3.1-pro',
  models: [
    { id: 'kimi-k3.1-pro', seesImages: true },
    { id: 'kimi-k3.1-pro-highspeed', seesImages: true },
  ],
  // The faster model costs more per token.
  defaultCheckModel: 'kimi-k3.1-pro',
  othersSeeImages: true,
} as const satisfies OpenAiVendor;
