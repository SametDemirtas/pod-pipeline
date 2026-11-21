import { LISTING_RULES } from '@pod/rules';
import { vi } from 'vitest';
import type { KeywordListDto, ListingDto, SettingsDto } from '@pod/contracts';
import {
  newBatchItem,
  type BatchItem,
  type BatchJob,
  type BatchJobId,
  type DesignId,
} from '@pod/core';
import { FixedClock } from '@pod/core/testing';
import { designDto, mockupDto, printCheckDto, shopOptionsDto } from './batch-fixtures.js';
import { fakeCatalog, settingsDto } from './fake-catalog.js';
import type { TextService } from '../application/listing/text-service.js';
import type { RotationService } from '../application/print/rotation-service.js';
import type { UpscaleService } from '../application/print/upscale-service.js';
import { batchSteps } from '../application/batch/steps/batch-steps.js';

const JOB: BatchJob = {
  id: 'j1' as BatchJobId,
  state: 'running',
  steps: ['print', 'mockups', 'research', 'text', 'draft'],
  market: 'US',
  createdAt: new Date('2026-10-28T09:00:00.000Z'),
  finishedAt: null,
};
export const PREPARED = {
  language: 'en-US',
  text: { title: 'Meadow Bees Mug', description: 'A mug.', tags: ['fall mug'] },
  translations: [{ language: 'de', text: { title: 'Tasse', description: 'Eine.', tags: [] } }],
};
export const written = (title: string) => ({
  title,
  description: `${title}.`,
  tags: ['fall mug'],
  humanizer: { fixed: 0, left: [] },
});

export function item(changes: Partial<BatchItem> = {}): BatchItem {
  return {
    ...newBatchItem(
      { id: 'id-01-mug' as DesignId, designKey: '01-mug', revision: 1, importedRevision: 1 },
      JOB.steps,
      undefined,
      null,
    ),
    ...changes,
  };
}

export function setUp(settings: Partial<SettingsDto> = {}) {
  const catalog = fakeCatalog();
  catalog.getDesign.mockResolvedValue(designDto('01-mug'));
  catalog.checkPrint.mockResolvedValue(printCheckDto());
  catalog.createMockups.mockResolvedValue([mockupDto('m1')]);
  catalog.getShopOptions.mockResolvedValue(shopOptionsDto());
  catalog.createListing.mockResolvedValue({
    ...({} as ListingDto),
    trademarks: [],
    aiTells: [],
  });
  const text = {
    writeListingText: vi.fn<TextService['writeListingText']>(() =>
      Promise.resolve(written('Meadow Bees Mug')),
    ),
    translateListingText: vi.fn<TextService['translateListingText']>(({ languages }) =>
      Promise.resolve({
        translations: languages.map((language) => ({ language, ...written(`[${language}]`) })),
        failed: [],
      }),
    ),
  };
  const wait = vi.fn(() => Promise.resolve());
  const keywordLists = fakeKeywordLists();
  const upscale = {
    upscaleDesign: vi.fn<UpscaleService['upscaleDesign']>(() =>
      Promise.resolve({ ...designDto('01-mug'), revision: 2, upscaleModel: 'photo' }),
    ),
  };
  const rotation = {
    rotateDesign: vi.fn<RotationService['rotateDesign']>(() =>
      Promise.resolve({ status: 'unneeded', reason: null, design: designDto('01-mug') }),
    ),
  };
  const steps = batchSteps({
    catalog,
    text,
    upscale,
    rotation,
    keywordLists,
    settings: {
      get: () =>
        Promise.resolve(
          settingsDto({ listingPrices: { mug: { amount: 1899, currency: 'USD' } }, ...settings }),
        ),
    },
    clock: new FixedClock(new Date('2026-10-28T09:00:00.000Z')),
    wait,
    rules: LISTING_RULES,
  });
  const run = (step: keyof typeof steps, current = item()) =>
    steps[step](
      current,
      { job: JOB, shop: () => catalog.getShopOptions() },
      new AbortController().signal,
    );
  return { catalog, text, upscale, rotation, keywordLists, wait, run };
}

/** Imported keyword lists, none until a test adds some. */
function fakeKeywordLists(lists: readonly KeywordListDto[] = []) {
  const summaryOf = (list: KeywordListDto) => ({
    id: list.id,
    fileName: list.fileName,
    market: list.market,
    importedAt: list.importedAt,
    keywordCount: list.keywords.length,
  });
  const fake = {
    lists: [...lists],
    listKeywordLists: vi.fn(() => Promise.resolve(fake.lists.map(summaryOf))),
    getKeywordList: vi.fn(({ id }: { id: string }) => {
      const found = fake.lists.find((list) => list.id === id);
      return found ? Promise.resolve(found) : Promise.reject(new Error(`No list ${id}`));
    }),
  };
  return fake;
}
