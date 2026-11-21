import type { ModelCatalog } from '@pod/adapter-ai';

/**
 * Image models that make the 4K scenes asked for, Google's recommended one in
 * October 2026 first. Every one reads the product photo it is given.
 */
export const GEMINI_SCENE_MODELS: ModelCatalog = {
  defaultModel: 'gemini-nano-banana-2.1',
  models: [
    { id: 'gemini-nano-banana-2.1', seesImages: true },
    { id: 'gemini-3-pro-image', seesImages: true },
    { id: 'gemini-3.1-flash-image', seesImages: true },
  ],
};
