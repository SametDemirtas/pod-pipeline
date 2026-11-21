import { describe, expect, it } from 'vitest';
import type { MockupDto, PrintCheckDto, PrintVariantDto } from '@pod/contracts/client';
import {
  listedAreas,
  listedTargets,
  listedPrintOf,
  listedSizes,
  listingPrint,
  providerPhotos,
  lowestDpiPrint,
} from './listed-print.js';
import { choosesByColor, listingVariantIds } from './listing-variants.js';

const area = (placement: string, width = 1000) => ({ placement, width, height: 1000, dpi: 300 });
const variant = (
  id: string,
  color: string | null,
  size: string | null,
  placements: readonly string[] = ['default'],
): PrintVariantDto => ({
  id,
  name: `${color ?? ''} ${size ?? ''}`,
  color,
  size,
  areas: placements.map((placement) => area(placement)),
});

function check(overrides: Partial<PrintCheckDto> = {}): PrintCheckDto {
  return {
    designId: 'd1',
    productId: '19',
    productName: 'Mug',
    variants: [variant('1320', 'White', '11 oz'), variant('4830', 'White', '15 oz')],
    variantId: '1320',
    printArea: 'default',
    fit: 'contain',
    placement: { x: 0, y: 0, width: 1000, height: 1000 },
    effectiveDpi: 300,
    quality: 'good',
    areaCovered: 1,
    imageCropped: 0,
    turnsToFit: false,
    upright: null,
    productFacts: { material: null, care: null, origin: null },
    ...overrides,
  } as PrintCheckDto;
}

const shirts = [
  variant('1', 'Black', 'S'),
  variant('2', 'Black', 'M'),
  variant('3', 'White', 'S'),
  variant('4', 'White', 'M', ['back']),
];

describe('listingVariantIds', () => {
  it('sells every size of the checked colour that prints on the checked area', () => {
    expect(choosesByColor(shirts)).toBe(true);
    expect(listingVariantIds(check({ variants: shirts, variantId: '3' }), undefined)).toEqual([
      '3',
    ]);
    expect(listingVariantIds(check({ variants: shirts, variantId: '1' }), undefined)).toEqual([
      '1',
      '2',
    ]);
  });

  it('sells every colour of a product chosen by name', () => {
    const cases = [variant('7', 'Clear', 'iPhone 15'), variant('8', null, 'iPhone 16')];
    expect(choosesByColor(cases)).toBe(false);
    expect(listingVariantIds(check({ variants: cases, variantId: '7' }), undefined)).toEqual([
      '7',
      '8',
    ]);
  });

  it('sells only the sizes the settings list for the family', () => {
    expect(listingVariantIds(check(), ['15 oz'])).toEqual(['4830']);
    expect(listingVariantIds(check(), ['20 oz'])).toEqual([]);
    expect(listingVariantIds(check({ printArea: 'back' }), undefined)).toEqual([]);
  });

  it('keeps the newest models when there are more than Etsy takes for one variation', () => {
    const models = Array.from({ length: 75 }, (_, index) =>
      variant(String(17_000 + index), 'Glossy', `Model ${String(index)}`),
    );
    const ids = listingVariantIds(
      check({ variants: models.reverse(), variantId: '17000' }),
      undefined,
    );

    expect(ids).toHaveLength(70);
    expect(ids).not.toContain('17004');
    expect(ids[0]).toBe('17074');
  });
});

describe('listed print', () => {
  it('photographs the first size the settings list, else the first sold', () => {
    expect(listedPrintOf(check(), ['15 oz', '11 oz']).mainVariantId).toBe('4830');
    expect(listedPrintOf(check(), undefined).mainVariantId).toBe('1320');
  });

  it('names the areas and sizes of the variants sold', () => {
    const listed = listedPrintOf(check(), ['15 oz']);
    expect(listedAreas(listed)).toEqual([area('default')]);
    expect(listedTargets(listed)).toEqual([
      { productId: listed.check.productId, variantId: '4830', area: area('default') },
    ]);
    expect(listedSizes(listed)).toEqual(['15 oz']);
  });

  it('prints a blanket edge to edge and others whole, on a chosen variant', () => {
    expect(listingPrint({ id: 'd1', familyId: 'blanket' }, '10986')).toEqual({
      designId: 'd1',
      variantId: '10986',
      fit: 'cover',
    });
    expect(listingPrint({ id: 'd2', familyId: 'mug' })).toEqual({ designId: 'd2', fit: 'contain' });
  });

  it('finds the check the design prints worst on', () => {
    const sharp = check({ effectiveDpi: 300 });
    const soft = check({ variantId: '4830', effectiveDpi: 140 });
    expect(lowestDpiPrint([sharp, soft, check({ effectiveDpi: 140 })])).toBe(soft);
    expect(lowestDpiPrint([])).toBeUndefined();
  });

  it("shows the provider's photos of the current revision, not scenes", () => {
    const photo = (id: string, designRevision: number, scenePrompt: string | null) =>
      ({ id, designRevision, scenePrompt }) as MockupDto;
    const photos = [photo('m1', 1, null), photo('old', 0, null), photo('scene', 1, 'On a table')];

    expect(providerPhotos(photos, 1).map(({ id }) => id)).toEqual(['m1']);
  });
});
