import type { TextModelCatalog } from '@pod/adapter-ai';

/** Claude models suggested to the seller: Opus writes the best text, Haiku costs the least. */
export const CLAUDE_TEXT_MODELS: TextModelCatalog = {
  defaultModel: 'claude-opus-5-5',
  models: [
    { id: 'claude-opus-5-5', seesImages: true },
    { id: 'claude-sonnet-5-5', seesImages: true },
    { id: 'claude-haiku-5-5', seesImages: true },
  ],
  defaultCheckModel: 'claude-haiku-5-5',
  // Every Claude model reads images.
  othersSeeImages: true,
};

/** Models that accept the server-side fallback, which reruns a declined request elsewhere. */
export const FALLBACK_MODELS: ReadonlySet<string> = new Set([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
]);
