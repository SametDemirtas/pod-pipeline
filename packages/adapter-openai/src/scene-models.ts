import type { ModelCatalog } from '@pod/adapter-ai';

/**
 * Image models that take the scene's custom size, Sunburst first for its precise
 * edits. Every one reads the product photo it is given.
 */
export const OPENAI_SCENE_MODELS: ModelCatalog = {
  defaultModel: 'gpt-image-2.5-sunburst',
  models: [
    { id: 'gpt-image-2.5-sunburst', seesImages: true },
    { id: 'gpt-image-2.5-flare', seesImages: true },
    { id: 'gpt-image-2', seesImages: true },
  ],
};
