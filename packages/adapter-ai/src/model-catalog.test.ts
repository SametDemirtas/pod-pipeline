import { describe, expect, it } from 'vitest';
import { seesImages, type ModelCatalog } from './model-catalog.js';

const catalog: ModelCatalog = {
  defaultModel: 'vision',
  models: [
    { id: 'vision', seesImages: true },
    { id: 'text', seesImages: false },
  ],
};

describe('seesImages', () => {
  it('reads a listed model from the catalog and an unlisted one from the fallback', () => {
    expect(seesImages(catalog, 'vision', false)).toBe(true);
    expect(seesImages(catalog, 'text', true)).toBe(false);
    expect(seesImages(catalog, 'new', true)).toBe(true);
    expect(seesImages(catalog, 'new', false)).toBe(false);
  });
});
