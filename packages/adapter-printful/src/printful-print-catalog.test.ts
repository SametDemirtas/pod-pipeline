import { DEFAULT_PRODUCT_FAMILIES, productFamilyId } from '@pod/core';
import { describe, expect, it } from 'vitest';
import { FakeFetch, type FakeReply } from '@pod/adapter-http/testing';
import { PrintfulClient } from './printful-client.js';
import { PrintfulPrintCatalog } from './printful-print-catalog.js';
import { ok } from './testing/fake-fetch.js';

const mug = productFamilyId('mug');

const PRODUCT_19 = ok({
  product: { id: 19, title: 'White Glossy Mug' },
  variants: [
    { id: 1320, name: 'White Glossy Mug 11 oz', color: 'White', size: '11 oz' },
    { id: 4830, name: 'White Glossy Mug 15 oz', color: 'White', size: '15 oz' },
    { id: 16586, name: 'White Glossy Mug 20 oz', color: 'White', size: '20 oz' },
    { id: 99999, name: 'Mug without a print file', color: 'White', size: '30 oz' },
    { id: 88888, name: 'Mug out of stock', color: 'White', size: '11 oz', in_stock: false },
  ],
});

const PRINTFILES_19 = ok({
  product_id: 19,
  available_placements: { default: 'Print file' },
  printfiles: [
    { printfile_id: 43, width: 2700, height: 1050, dpi: 300, fill_mode: 'fit', can_rotate: false },
    { printfile_id: 44, width: 2700, height: 1140, dpi: 300, fill_mode: 'fit', can_rotate: false },
    { printfile_id: 426, width: 3071, height: 1205, dpi: 300, fill_mode: 'fit', can_rotate: false },
  ],
  variant_printfiles: [
    { variant_id: 1320, placements: { default: 43 } },
    { variant_id: 4830, placements: { default: 44 } },
    { variant_id: 16586, placements: { default: 426 } },
    { variant_id: 88888, placements: { default: 43 } },
  ],
});

function catalogWith(...replies: FakeReply[]) {
  const fake = new FakeFetch().reply(...replies);
  const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
  return { fake, catalog: new PrintfulPrintCatalog(client) };
}

describe('PrintfulPrintCatalog', () => {
  it('builds the mug from every variant in stock that has a print area', async () => {
    const { fake, catalog } = catalogWith(PRODUCT_19, PRINTFILES_19);

    expect(await catalog.findProduct(mug)).toEqual({
      familyId: 'mug',
      productId: '19',
      name: 'White Glossy Mug',
      variants: [
        {
          id: '1320',
          name: 'White Glossy Mug 11 oz',
          color: 'White',
          size: '11 oz',
          areas: [{ placement: 'default', width: 2700, height: 1050, dpi: 300 }],
        },
        {
          id: '4830',
          name: 'White Glossy Mug 15 oz',
          color: 'White',
          size: '15 oz',
          areas: [{ placement: 'default', width: 2700, height: 1140, dpi: 300 }],
        },
        {
          id: '16586',
          name: 'White Glossy Mug 20 oz',
          color: 'White',
          size: '20 oz',
          areas: [{ placement: 'default', width: 3071, height: 1205, dpi: 300 }],
        },
      ],
    });
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://api.printful.com/products/19',
      'https://api.printful.com/mockup-generator/printfiles/19',
    ]);
  });

  it('asks Printful only once per product', async () => {
    const { fake, catalog } = catalogWith(PRODUCT_19, PRINTFILES_19);

    const [first, second] = await Promise.all([catalog.findProduct(mug), catalog.findProduct(mug)]);

    expect(second).toBe(first);
    expect(fake.requests).toHaveLength(2);
  });

  it('keeps each family apart when two families share a Printful product', async () => {
    const fake = new FakeFetch().reply(PRODUCT_19, PRINTFILES_19, PRODUCT_19, PRINTFILES_19);
    const client = new PrintfulClient({ fetch: fake.fetch, token: () => Promise.resolve('t') });
    const travelMug = productFamilyId('travel-mug');
    const catalog = new PrintfulPrintCatalog(client, { [mug]: 19, [travelMug]: 19 });

    expect((await catalog.findProduct(mug))?.familyId).toBe('mug');
    expect((await catalog.findProduct(travelMug))?.familyId).toBe('travel-mug');
  });

  it('asks again after a failed lookup', async () => {
    const { fake, catalog } = catalogWith(
      { status: 500, body: { code: 500, result: 'down' } },
      PRINTFILES_19,
      PRODUCT_19,
      PRINTFILES_19,
    );

    await expect(catalog.findProduct(mug)).rejects.toMatchObject({ status: 500 });
    expect((await catalog.findProduct(mug))?.variants).toHaveLength(3);
    expect(fake.requests).toHaveLength(4);
  });

  it('offers the front and back of a shirt, main area first, without sleeves or labels', async () => {
    const { catalog } = catalogWith(
      ok({
        product: { title: 'Unisex Staple T-Shirt' },
        variants: [
          { id: 4012, name: 'Shirt (Black / M)', color: ' Black ', size: 'M' },
          { id: 4013, name: 'Shirt (Black / L)', color: 'Black', size: 'L' },
        ],
      }),
      ok({
        available_placements: { sleeve_left: 'Left sleeve', back: 'Back', front: 'Front' },
        printfiles: [
          { printfile_id: 1, width: 1800, height: 2400, dpi: 150 },
          { printfile_id: 71, width: 450, height: 450, dpi: 150 },
        ],
        variant_printfiles: [
          { variant_id: 4012, placements: { front: 1, back: 1, sleeve_left: 71 } },
          { variant_id: 4013, placements: { back: 1 } },
        ],
      }),
    );

    const variants = (await catalog.findProduct(mug))?.variants ?? [];

    expect(variants.map((variant) => variant.areas.map((area) => area.placement))).toEqual([
      ['front', 'back'],
      ['back'],
    ]);
    expect(variants[0]).toMatchObject({ color: 'Black', size: 'M' });
  });

  it('uses the first placement when none is meant for a whole design', async () => {
    const { catalog } = catalogWith(
      ok({ product: { title: 'Label' }, variants: [{ id: 1, name: 'Label', color: ' ' }] }),
      ok({
        available_placements: { label_inside: 'Inside label' },
        printfiles: [{ printfile_id: 7, width: 600, height: 600, dpi: 300 }],
        variant_printfiles: [{ variant_id: 1, placements: { label_inside: 7 } }],
      }),
    );

    const product = await catalog.findProduct(mug);

    expect(product?.variants).toEqual([
      {
        id: '1',
        name: 'Label',
        color: null,
        size: null,
        areas: [{ placement: 'label_inside', width: 600, height: 600, dpi: 300 }],
      },
    ]);
  });

  it('makes every product family on a Printful product', async () => {
    const notFound: FakeReply = { status: 404, body: { code: 404, result: 'Not found' } };
    const families = DEFAULT_PRODUCT_FAMILIES.map((family) => family.id);
    const { fake, catalog } = catalogWith(...Array<FakeReply>(families.length * 2).fill(notFound));

    for (const family of families) {
      await expect(catalog.findProduct(family)).rejects.toMatchObject({ status: 404 });
    }
    const asked = fake.requests.filter((request) => /\/products\/\d+$/.test(request.url));
    expect(asked).toHaveLength(families.length);
  });

  it('makes iPhone and Samsung cases on their own Printful products', async () => {
    const notFound: FakeReply = { status: 404, body: { code: 404, result: 'Not found' } };
    const { fake, catalog } = catalogWith(...Array<FakeReply>(4).fill(notFound));

    for (const family of ['phone-case', 'samsung-case']) {
      await catalog.findProduct(productFamilyId(family)).catch(() => undefined);
    }

    expect(fake.requests.map((request) => request.url)).toEqual(
      expect.arrayContaining([
        'https://api.printful.com/products/601',
        'https://api.printful.com/products/686',
      ]),
    );
  });

  it('offers nothing for families without a Printful product', async () => {
    const { fake, catalog } = catalogWith();

    expect(await catalog.findProduct(productFamilyId('lamp'))).toBeUndefined();
    expect(fake.requests).toEqual([]);
  });

  it('rejects responses it cannot read', async () => {
    const { catalog } = catalogWith(
      ok({ product: { title: 'Mug' }, variants: 'none' }),
      PRINTFILES_19,
    );

    await expect(catalog.findProduct(mug)).rejects.toThrow(/variants is not a list/);
  });

  it('rejects a print area without a size', async () => {
    const { catalog } = catalogWith(
      PRODUCT_19,
      ok({
        available_placements: { default: 'Print file' },
        printfiles: [{ printfile_id: 43, width: '2700', height: 1050, dpi: 300 }],
        variant_printfiles: [],
      }),
    );

    await expect(catalog.findProduct(mug)).rejects.toThrow(/printfile width is not a number/);
  });

  it('rejects printfiles without placements', async () => {
    const { catalog } = catalogWith(
      PRODUCT_19,
      ok({ available_placements: {}, printfiles: [], variant_printfiles: [] }),
    );

    await expect(catalog.findProduct(mug)).rejects.toThrow(/first placement is not text/);
  });
});
