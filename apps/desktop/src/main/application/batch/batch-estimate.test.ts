import { describe, expect, it } from 'vitest';
import type { AiCatalogDto, BatchRequest, ListingDto } from '@pod/contracts';
import { newBatchItem, type BatchItem, type DesignId } from '@pod/core';
import { designDto, mockupDto, shopOptionsDto } from '../../testing/batch-fixtures.js';
import { fakeCatalog, settingsDto } from '../../testing/fake-catalog.js';
import { estimateBatch } from './batch-estimate.js';

const DESIGNS = [designDto('01-mug'), designDto('01-blanket'), designDto('02-mug', 'Meadow Bees')];
const EVERY_STEP: BatchRequest = {
  selection: { kind: 'filter' },
  steps: ['print', 'mockups', 'research', 'text', 'draft'],
  market: 'US',
};
const AI_CATALOG = { anthropic: { service: 'Claude' } } as unknown as AiCatalogDto;

function setUp() {
  const catalog = fakeCatalog();
  catalog.getShopOptions.mockResolvedValue(shopOptionsDto());
  catalog.listMockups.mockImplementation(({ id }) =>
    Promise.resolve(id === 'id-01-mug' ? [mockupDto('m1')] : []),
  );
  catalog.getListing.mockImplementation(({ id }) =>
    Promise.resolve(id === 'id-02-mug' ? ({} as ListingDto) : null),
  );
  const settings = {
    get: () =>
      Promise.resolve(
        settingsDto({
          shippingProfiles: { blanket: '999' },
          listingPrices: { mug: { amount: 1899, currency: 'USD' } },
          listingSizes: { blanket: ['50″×60″'] },
        }),
      ),
  };
  const deps = {
    catalog,
    settings,
    aiCatalog: AI_CATALOG,
  };
  return { catalog, deps };
}

describe('estimateBatch', () => {
  it('counts only the work not done yet', async () => {
    const { deps } = setUp();

    expect(await estimateBatch(deps, DESIGNS, EVERY_STEP, () => undefined, new Set())).toEqual({
      designs: 3,
      printChecks: 3,
      // 01-mug has photos already.
      mockupTasks: 2,
      // 02-mug has a listing; the others are written in English and translated twice.
      textRequests: { min: 6, max: 12 },
      textService: 'Claude',
      textModel: 'claude-opus-5-5',
      languages: ['en-US', 'de', 'fr'],
      drafts: 2,
      draftsWaiting: 0,
      // Blankets have no price for the size the settings list.
      missingPrices: [{ familyId: 'blanket', sizes: ['50″×60″'] }],
      shipping: [
        { familyId: 'mug', profile: 'Printful', missing: null },
        // The profile chosen for blankets is no longer in the shop.
        { familyId: 'blanket', profile: null, missing: 'gone' },
      ],
    });
  });

  it('leaves out text an earlier job wrote for the design', async () => {
    const { deps } = setUp();
    const prepared: BatchItem = {
      ...newBatchItem(
        { id: 'id-01-mug' as DesignId, designKey: '01-mug', revision: 1, importedRevision: 1 },
        [],
        undefined,
        null,
      ),
      keywords: [],
      text: {
        language: 'en-US',
        text: { title: 'T', description: 'D', tags: [] },
        translations: [{ language: 'de', text: { title: 'T', description: 'D', tags: [] } }],
      },
    };

    const estimate = await estimateBatch(
      deps,
      DESIGNS,
      EVERY_STEP,
      (id) => (id === prepared.designId ? prepared : undefined),
      new Set(),
    );

    expect(estimate.textRequests).toEqual({ min: 4, max: 8 });
    const older = await estimateBatch(
      deps,
      DESIGNS,
      EVERY_STEP,
      (id) => (id === prepared.designId ? { ...prepared, designRevision: 0 } : undefined),
      new Set(),
    );
    expect(older.textRequests).toEqual({ min: 6, max: 12 });
    const larger = {
      ...designDto('01-mug'),
      revision: 2,
      upscaleModel: 'photo' as const,
      revisions: [
        { ...designDto('01-mug'), revision: 2, upscaleModel: 'photo' as const, recordedAt: '' },
        { ...designDto('01-mug'), recordedAt: '' },
      ],
    };
    deps.catalog.getDesign.mockResolvedValue(larger);
    const madeLarger = await estimateBatch(
      deps,
      [larger, ...DESIGNS.slice(1)],
      EVERY_STEP,
      (id) => (id === prepared.designId ? prepared : undefined),
      new Set(),
    );
    expect(madeLarger.textRequests).toEqual({ min: 4, max: 8 });
    const unchecked = await estimateBatch(
      deps,
      DESIGNS,
      EVERY_STEP,
      () => undefined,
      new Set(['id-01-mug']),
    );
    expect(unchecked).toMatchObject({ drafts: 1, draftsWaiting: 1 });
  });

  it('tells a shop without any shipping profile apart from a chosen one that left', async () => {
    const { catalog, deps } = setUp();
    catalog.getShopOptions.mockResolvedValue(shopOptionsDto({ shippingProfiles: [] }));

    const estimate = await estimateBatch(deps, DESIGNS, EVERY_STEP, () => undefined, new Set());

    expect(estimate.shipping).toEqual([
      { familyId: 'mug', profile: null, missing: 'none' },
      { familyId: 'blanket', profile: null, missing: 'gone' },
    ]);
  });

  it('asks nothing of Etsy for steps that do not need it', async () => {
    const { catalog, deps } = setUp();

    const estimate = await estimateBatch(
      deps,
      DESIGNS,
      { ...EVERY_STEP, steps: ['print'] },
      () => undefined,
      new Set(),
    );

    expect(estimate).toMatchObject({
      printChecks: 3,
      mockupTasks: 0,
      textRequests: { min: 0, max: 0 },
      languages: [],
      drafts: 0,
      shipping: [],
    });
    expect(catalog.getShopOptions).not.toHaveBeenCalled();
  });
});
