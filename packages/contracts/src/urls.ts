import type { AiProvider } from './dto.js';

/** The address the seller adds to their Etsy app as its callback URL. */
export const ETSY_CALLBACK_URL = 'http://localhost:3003/oauth/redirect';

/** The address the seller adds to their Pinterest app as its redirect URI. */
export const PINTEREST_CALLBACK_URL = 'http://localhost:3004/oauth/redirect';

/** Where the seller creates an API key for each AI service. */
export const AI_KEY_PAGES: Readonly<Record<AiProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  kimi: 'https://platform.moonshot.ai/console/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
};

/** Custom URL scheme the window uses to load stored images. */
export const ASSET_PROTOCOL = 'pod-asset';

/** Thumbnail widths the asset protocol serves; anything else is refused. */
export const THUMBNAIL_WIDTHS = [160, 320, 640, 1280] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

export function assetUrl(storageKey: string, width?: ThumbnailWidth): string {
  const query = width ? `?w=${width}` : '';
  return `${ASSET_PROTOCOL}://asset/${encodeURI(storageKey)}${query}`;
}
