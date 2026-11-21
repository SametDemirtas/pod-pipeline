import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, PrintProductUnavailableError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import { FakePrintCatalog, InMemoryCatalog, SAMPLE_MUG, SAMPLE_SHIRT } from '../testing/index.js';
import { CheckDesignPrint } from './check-design-print.js';

describe('CheckDesignPrint', () => {
  let check: CheckDesignPrint;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Tulip'));
    await catalog.designs.save(sampleDesign('01-mug'));
    await catalog.designs.save(sampleDesign('01-blanket'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    check = new CheckDesignPrint(catalog, new FakePrintCatalog([SAMPLE_MUG, SAMPLE_SHIRT]));
  });

  it('checks the first variant when none is chosen', async () => {
    const result = await check.execute({ designId: 'design-01-mug', fit: 'contain' });

    expect(result.design.designKey).toBe('01-mug');
    expect(result.product.productId).toBe('19');
    expect(result.variant.id).toBe('1320');
    expect(result.check).toMatchObject({ fit: 'contain', effectiveDpi: 470, quality: 'good' });
  });

  it('checks the chosen variant', async () => {
    const result = await check.execute({
      designId: 'design-01-mug',
      variantId: '4830',
      fit: 'cover',
    });

    expect(result.area.height).toBe(1140);
    expect(result.check.areaCovered).toBe(1);
  });

  it('checks the main print area unless another one is chosen', async () => {
    const front = await check.execute({ designId: 'design-01-t-shirt', fit: 'contain' });
    const back = await check.execute({
      designId: 'design-01-t-shirt',
      variantId: '4011',
      printArea: 'back',
      fit: 'contain',
    });

    expect([front.variant.id, front.area.placement]).toEqual(['4000', 'front']);
    expect([back.variant.id, back.area.placement]).toEqual(['4011', 'back']);
  });

  it('rejects a print area the variant does not have', async () => {
    await expect(
      check.execute({ designId: 'design-01-mug', printArea: 'back', fit: 'contain' }),
    ).rejects.toThrow(/Print area back/);
  });

  it('rejects an unknown fit, design or variant', async () => {
    await expect(
      check.execute({ designId: 'design-01-mug', fit: 'stretch' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(check.execute({ designId: 'missing', fit: 'contain' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      check.execute({ designId: 'design-01-mug', variantId: '1', fit: 'contain' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('says the product is unavailable when none of its variants can be printed', async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    const empty = new CheckDesignPrint(
      catalog,
      new FakePrintCatalog([{ ...SAMPLE_MUG, variants: [] }]),
    );

    await expect(
      empty.execute({ designId: 'design-01-mug', fit: 'contain' }),
    ).rejects.toBeInstanceOf(PrintProductUnavailableError);
  });

  it('treats an empty variant id as a variant that does not exist', async () => {
    await expect(
      check.execute({ designId: 'design-01-mug', variantId: '', fit: 'contain' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('says when the product family has no print product yet', async () => {
    await expect(
      check.execute({ designId: 'design-01-blanket', fit: 'contain' }),
    ).rejects.toBeInstanceOf(PrintProductUnavailableError);
  });

  it('checks artwork of the other orientation upright on the area turned, when the provider takes it so', async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Tulip'));
    const tall = sampleDesign('01-mug');
    await catalog.designs.save({ ...tall, asset: { ...tall.asset, width: 1050, height: 2700 } });
    const upright = new CheckDesignPrint(catalog, new FakePrintCatalog([SAMPLE_MUG]), {
      supportsOrientation: () => Promise.resolve(true),
    });

    const result = await upright.execute({ designId: 'design-01-mug', fit: 'cover' });

    expect(result.area).toMatchObject({ width: 2700, height: 1050 });
    expect(result.upright).toMatchObject({
      area: { width: 1050, height: 2700 },
      orientation: 'vertical',
    });
    expect(result.check).toMatchObject({ areaCovered: 1, imageCropped: 0 });
  });
});
