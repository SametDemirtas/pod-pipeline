import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { sampleConcept, sampleDesign } from '../../testing/contract/index.js';
import {
  FakeImagePreviews,
  FakeProductReader,
  InMemoryCatalog,
  InMemoryMockups,
  SAMPLE_PRODUCT_DETAILS,
} from '../../testing/index.js';
import { DescribeProduct } from './describe-product.js';
import type { Mockup, MockupId } from '../mockup.js';

const SHIRT = 'design-01-t-shirt' as DesignId;

const photo: Mockup = {
  id: 'm1' as MockupId,
  designId: SHIRT,
  designRevision: 1,
  variantId: '4000',
  printArea: 'front',
  view: 'Front',
  scenePrompt: null,
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: 'm1',
    storageKey: 'ab/m1',
    mimeType: 'image/png',
    width: 1000,
    height: 1000,
    byteSize: 10,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
};

describe('DescribeProduct', () => {
  let mockups: InMemoryMockups;
  let reader: FakeProductReader;
  let previews: FakeImagePreviews;
  let describeProduct: DescribeProduct;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    mockups = new InMemoryMockups();
    await mockups.replace(SHIRT, { variantId: '4000', printArea: 'front' }, [photo]);
    reader = new FakeProductReader();
    previews = new FakeImagePreviews();
    describeProduct = new DescribeProduct({ query: catalog, mockups, previews, reader });
  });

  it('reads a photo once and keeps the details with it', async () => {
    const input = { designId: SHIRT, mockupId: 'm1' };

    expect(await describeProduct.execute(input)).toEqual(SAMPLE_PRODUCT_DETAILS);
    expect(await describeProduct.execute(input)).toEqual(SAMPLE_PRODUCT_DETAILS);

    expect(reader.requests).toEqual([{ photo: previews.image, productType: 't shirt' }]);
    expect(await mockups.productDetails(SHIRT, photo.id)).toEqual(SAMPLE_PRODUCT_DETAILS);
  });

  it('keeps nothing when the reader fails, so the next scene asks again', async () => {
    reader.failWith = new Error('overloaded');

    await expect(describeProduct.execute({ designId: SHIRT, mockupId: 'm1' })).rejects.toThrow(
      'overloaded',
    );
    expect(await mockups.productDetails(SHIRT, photo.id)).toBeNull();
  });

  it.each([
    ['an unknown photo', 'gone', NotFoundError],
    ['a scene', 's1', ValidationError],
  ])('refuses %s without reading', async (_case, mockupId, error) => {
    await mockups.add([{ ...photo, id: 's1' as MockupId, scenePrompt: 'on a table' }]);

    await expect(describeProduct.execute({ designId: SHIRT, mockupId })).rejects.toBeInstanceOf(
      error,
    );
    expect(reader.requests).toEqual([]);
  });
});
