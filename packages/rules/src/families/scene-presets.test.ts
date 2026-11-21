import { describe, expect, it } from 'vitest';
import { MAX_SCENE_PROMPT_LENGTH } from '@pod/contracts/client';
import { DEFAULT_FAMILY_IDS } from './family-ids.js';
import { presetsFor, sceneKindsFor } from './scene-presets.js';

describe('scene presets', () => {
  const MODEL_FAMILIES = [
    'mug',
    't-shirt',
    'sweatshirt',
    'hoodie',
    'tote-bag',
    'phone-case',
    'samsung-case',
  ];

  it('has English product and marketing scenes for every family, and model scenes for some', () => {
    for (const family of DEFAULT_FAMILY_IDS) {
      const kinds = sceneKindsFor(family);
      expect(kinds, family).toEqual(
        MODEL_FAMILIES.includes(family)
          ? ['product', 'marketing', 'model']
          : ['product', 'marketing'],
      );
      for (const kind of kinds) {
        const scenes = presetsFor(family, kind);
        expect(scenes.length, `${family} ${kind}`).toBeGreaterThanOrEqual(1);
        expect(scenes.length, `${family} ${kind}`).toBeLessThanOrEqual(4);
        for (const [, scene] of scenes) {
          expect(scene).toMatch(/^[\x20-\x7Eé]+$/);
          expect(scene.length).toBeLessThanOrEqual(MAX_SCENE_PROMPT_LENGTH);
        }
      }
      expect(presetsFor(family, 'product').length, family).toBeGreaterThanOrEqual(3);
    }
    expect(sceneKindsFor('toString')).toEqual([]);
    expect(presetsFor('toString', 'product')).toEqual([]);
    expect(presetsFor('poster', 'model')).toEqual([]);
  });
});
