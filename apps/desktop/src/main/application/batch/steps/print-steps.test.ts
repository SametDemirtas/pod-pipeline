import { describe, expect, it } from 'vitest';
import { type DesignId } from '@pod/core';
import { designDto, mockupDto, printCheckDto } from '../../../testing/batch-fixtures.js';
import { PREPARED, item, setUp } from '../../../testing/batch-steps-setup.js';

describe('print steps', () => {
  it('pass a sharp print and stop a blurred one', async () => {
    const { catalog, run } = setUp();

    expect(await run('print')).toEqual({ state: 'done' });
    expect(catalog.checkPrint).toHaveBeenCalledWith({ designId: 'id-01-mug', fit: 'contain' });
    catalog.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 90 }));
    await expect(run('print')).rejects.toMatchObject({
      code: 'PRINT_QUALITY_POOR',
      details: { effectiveDpi: 90 },
    });
  });

  it('make mockups of the front once, only when the revision has no Printful photos', async () => {
    const { catalog, run } = setUp();
    catalog.listMockups.mockResolvedValue([mockupDto('scene', { scenePrompt: 'A table' })]);

    expect(await run('mockups')).toEqual({ state: 'done' });
    expect(catalog.createMockups).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      variantId: '1320',
      fit: 'contain',
    });

    catalog.listMockups.mockResolvedValue([mockupDto('m1')]);
    expect(await run('mockups')).toEqual({ state: 'skipped' });
    expect(catalog.createMockups).toHaveBeenCalledTimes(1);
  });
});

describe('blanket in two sizes', () => {
  const SMALL = '50″×60″';
  const LARGE = '60″×80″';
  const blanketCheck = (variantId: string, effectiveDpi = 200) =>
    printCheckDto({
      designId: 'id-01-blanket',
      productId: '395',
      variants: [
        { id: '13222', name: 'Blanket 60×80', color: null, size: LARGE, areas: [area(8000)] },
        { id: '22609', name: 'Blanket 30×40', color: null, size: '30″×40″', areas: [area(4000)] },
        { id: '10986', name: 'Blanket 50×60', color: null, size: SMALL, areas: [area(6000)] },
      ],
      variantId,
      printArea: 'default',
      fit: 'cover',
      effectiveDpi,
      quality: effectiveDpi < 150 ? 'poor' : 'good',
    });
  function area(height: number) {
    return { placement: 'default', width: height * 0.8, height, dpi: 150 };
  }
  const blanket = (sizes: readonly string[], sizePrices = {}) => {
    const setup = setUp({
      listingPrices: { blanket: { amount: 5499, currency: 'USD' } },
      sizePrices: { blanket: sizePrices },
      listingSizes: { blanket: sizes },
    });
    setup.catalog.getDesign.mockResolvedValue(designDto('01-blanket'));
    setup.catalog.checkPrint.mockImplementation(({ variantId }) =>
      Promise.resolve(
        blanketCheck(variantId ?? '13222', variantId === '13222' || !variantId ? 120 : 200),
      ),
    );
    setup.catalog.listMockups.mockResolvedValue([mockupDto('m1')]);
    return setup;
  };
  const blanketItem = () =>
    item({
      designId: 'id-01-blanket' as DesignId,
      designKey: '01-blanket',
      text: PREPARED,
    });

  it('checks every size listed, edge to edge, and names the one printing worst', async () => {
    const small = blanket([SMALL]);
    expect(await small.run('print', blanketItem())).toEqual({ state: 'done' });
    expect(small.catalog.checkPrint).toHaveBeenCalledWith({
      designId: 'id-01-blanket',
      variantId: '10986',
      fit: 'cover',
    });

    const both = blanket([SMALL, LARGE]);
    await expect(both.run('print', blanketItem())).rejects.toMatchObject({
      code: 'PRINT_QUALITY_POOR',
      details: { effectiveDpi: 120, size: LARGE },
    });
  });

  it('photographs the first size listed', async () => {
    const { catalog, run } = blanket([SMALL, LARGE]);
    catalog.listMockups.mockResolvedValue([]);

    await run('mockups', blanketItem());

    expect(catalog.createMockups).toHaveBeenCalledWith({
      designId: 'id-01-blanket',
      variantId: '10986',
      fit: 'cover',
    });
  });

  it('sells each size at its own price, the others at the family price', async () => {
    const { catalog, run } = blanket([SMALL, LARGE], {
      [LARGE]: { amount: 7499, currency: 'USD' },
    });

    await run('draft', blanketItem());

    expect(catalog.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        fit: 'cover',
        variantIds: ['13222', '10986'],
        price: 5499,
        sizePrices: { [LARGE]: 7499 },
      }),
    );
  });

  it('stops for a size without a price when the family has none', async () => {
    const { catalog, run } = blanket([SMALL, LARGE], {
      [SMALL]: { amount: 5499, currency: 'USD' },
    });
    const settingsless = setUp({
      listingPrices: {},
      sizePrices: { blanket: { [SMALL]: { amount: 5499, currency: 'USD' } } },
      listingSizes: { blanket: [SMALL, LARGE] },
    });
    settingsless.catalog.getDesign.mockResolvedValue(designDto('01-blanket'));
    settingsless.catalog.checkPrint.mockResolvedValue(blanketCheck('13222'));

    await expect(settingsless.run('draft', blanketItem())).rejects.toMatchObject({
      code: 'LISTING_PRICE_MISSING',
      details: { familyId: 'blanket', sizes: [LARGE] },
    });
    expect(catalog.createListing).not.toHaveBeenCalled();
    await run('draft', blanketItem());
    expect(catalog.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ sizePrices: { [SMALL]: 5499 } }),
    );
  });
});
