import { describe, expect, it } from 'vitest';
import { MAX_BATCH_DESIGNS, MAX_PAGE_SIZE } from '@pod/contracts';
import { NotFoundError } from '@pod/core';
import { designDto } from '../../testing/batch-fixtures.js';
import { fakeCatalog } from '../../testing/fake-catalog.js';
import { selectedDesigns } from './batch-designs.js';

describe('selectedDesigns', () => {
  it('reads every page the filter matches', async () => {
    const catalog = fakeCatalog();
    catalog.listDesigns
      .mockResolvedValueOnce({ items: [designDto('01-mug')], nextCursor: 'next', total: 3 })
      .mockResolvedValueOnce({
        items: [designDto('02-mug'), designDto('03-mug')],
        nextCursor: null,
        total: 3,
      });

    const designs = await selectedDesigns(catalog, {
      kind: 'filter',
      familyId: 'mug',
      search: 'w',
      excludeIds: ['id-03-mug'],
    });

    expect(designs.map((design) => design.designKey)).toEqual(['01-mug', '02-mug']);
    expect(catalog.listDesigns).toHaveBeenLastCalledWith({
      familyId: 'mug',
      search: 'w',
      limit: MAX_PAGE_SIZE,
      cursor: 'next',
    });
  });

  it('refuses a filter matching nothing or more than a job holds', async () => {
    const catalog = fakeCatalog();

    await expect(selectedDesigns(catalog, { kind: 'filter' })).rejects.toThrow(/matches no design/);
    const many = Array.from({ length: MAX_BATCH_DESIGNS + 1 }, (_, index) =>
      designDto(`${String(index)}-mug`),
    );
    catalog.listDesigns.mockResolvedValue({ items: many, nextCursor: null, total: many.length });
    await expect(selectedDesigns(catalog, { kind: 'filter' })).rejects.toThrow(/at most/);
    const fewer = await selectedDesigns(catalog, {
      kind: 'filter',
      excludeIds: [many[0]?.id ?? ''],
    });
    expect(fewer).toHaveLength(MAX_BATCH_DESIGNS);
  });

  it('reads each picked design once, and refuses one that is gone', async () => {
    const catalog = fakeCatalog();
    catalog.getDesign.mockImplementation(({ id }) => Promise.resolve(designDto(id.slice(3))));

    const designs = await selectedDesigns(catalog, {
      kind: 'designs',
      designIds: ['id-01-mug', 'id-01-mug', 'id-02-mug'],
    });

    expect(designs.map((design) => design.designKey)).toEqual(['01-mug', '02-mug']);
    catalog.getDesign.mockRejectedValue(new NotFoundError('Design', 'x'));
    await expect(
      selectedDesigns(catalog, { kind: 'designs', designIds: ['x'] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
