import { describe, expect, it } from 'vitest';
import { DEFAULT_FAMILY_IDS } from './family-ids.js';
import { familyProfileOf } from './family-profile.js';

describe('familyProfileOf', () => {
  it.each(DEFAULT_FAMILY_IDS)('describes the %s as a real object in one short line', (id) => {
    const line = familyProfileOf(id).physics ?? '';
    expect(line).toMatch(/^The .+\.$/);
    expect(line.length).toBeLessThanOrEqual(200);
  });

  it('prints only blankets edge to edge, and turns only their artwork to fit', () => {
    const edgeToEdge = DEFAULT_FAMILY_IDS.filter((id) => familyProfileOf(id).fit === 'cover');
    const turnable = DEFAULT_FAMILY_IDS.filter((id) => familyProfileOf(id).turnable);

    expect([edgeToEdge, turnable]).toEqual([['blanket'], ['blanket']]);
    expect(familyProfileOf('blanket').printOnFabric).toMatch(/^- The blanket /);
    expect(familyProfileOf('mug').printOnFabric).toBeNull();
  });

  it('names clothing sizes, phone models and plain sizes', () => {
    expect(familyProfileOf('hoodie').sizeKind).toBe('clothing');
    expect(familyProfileOf('samsung-case').sizeKind).toBe('model');
    expect(familyProfileOf('mug').sizeKind).toBe('size');
  });

  it('knows which products lie flat', () => {
    expect(familyProfileOf('blanket').liesFlat).toBe(true);
    expect(familyProfileOf('mug').liesFlat).toBe(false);
    expect(familyProfileOf('canvas').liesFlat).toBe(false);
  });

  it('keeps each phone case listing to its own brand', () => {
    expect(familyProfileOf('phone-case').otherBrands).toEqual(['Samsung']);
    expect(familyProfileOf('samsung-case').otherBrands).toEqual(['iPhone']);
    expect(familyProfileOf('mug').otherBrands).toEqual([]);
  });

  it('treats a family the seller added, or an inherited name, plainly', () => {
    for (const id of ['pillow', 'toString', 'constructor']) {
      expect(familyProfileOf(id)).toEqual({
        fit: 'contain',
        sizeKind: 'size',
        turnable: false,
        liesFlat: false,
        physics: null,
        printOnFabric: null,
        otherBrands: [],
        scenes: {},
      });
    }
  });
});
