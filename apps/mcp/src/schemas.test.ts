import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { CatalogApi } from '@pod/contracts/client';
import type { CompactPrintCheck } from './inputs/print-input.js';
import type { outputs } from './schemas.js';

/** What a schema spells out, without the room a loose object leaves for other fields. */
type Spelled<T> = T extends readonly (infer Item)[]
  ? readonly Spelled<Item>[]
  : T extends object
    ? { readonly [K in keyof T as string extends K ? never : K]: Spelled<T[K]> }
    : T;

/** What a tool's output schema asks of the answer. */
type Output<S> = Spelled<
  z.output<S extends z.ZodType ? S : S extends z.ZodRawShape ? z.ZodObject<S> : never>
>;

/** What the app answers to one of its operations. */
type Answer<K extends keyof CatalogApi> = Awaited<ReturnType<CatalogApi[K]>>;

describe('tool output schemas', () => {
  it('ask only for what the app answers, in the types it answers with', () => {
    expectTypeOf<{ families: Answer<'listFamilies'> }>().toExtend<
      Output<typeof outputs.families>
    >();
    expectTypeOf<{ folders: Answer<'listImportFolders'> }>().toExtend<
      Output<typeof outputs.folders>
    >();
    expectTypeOf<Answer<'listDesigns'>>().toExtend<Output<typeof outputs.designPage>>();
    expectTypeOf<Answer<'getDesign'>>().toExtend<Output<typeof outputs.design>>();
    expectTypeOf<Answer<'previewImport'>>().toExtend<Output<typeof outputs.preview>>();
    expectTypeOf<Answer<'runImport'>>().toExtend<Output<typeof outputs.importResult>>();
    expectTypeOf<CompactPrintCheck>().toExtend<Output<typeof outputs.printCheck>>();
    expectTypeOf<{ mockups: Answer<'listMockups'> }>().toExtend<Output<typeof outputs.mockups>>();
    expectTypeOf<Answer<'getShopOptions'>>().toExtend<Output<typeof outputs.shopOptions>>();
    expectTypeOf<{ listing: Answer<'getListing'> }>().toExtend<
      Output<typeof outputs.listingOrNone>
    >();
    expectTypeOf<{ listing: Answer<'refreshListing'> }>().toExtend<
      Output<typeof outputs.listingOrNone>
    >();
    expectTypeOf<Answer<'listingPhotos'>>().toExtend<Output<typeof outputs.listingPhotos>>();
    expectTypeOf<Answer<'createListing'>>().toExtend<Output<typeof outputs.createdListing>>();
    expectTypeOf<Answer<'linkListing'>>().toExtend<Output<typeof outputs.listing>>();
    expectTypeOf<Answer<'replaceListingPhotos'>>().toExtend<Output<typeof outputs.listing>>();
    expectTypeOf<Answer<'researchKeywords'>>().toExtend<Output<typeof outputs.researchRun>>();
    expectTypeOf<Answer<'getResearch'>>().toExtend<Output<typeof outputs.researchRun>>();
    expectTypeOf<{ runs: Answer<'listResearch'> }>().toExtend<
      Output<typeof outputs.researchList>
    >();
    expectTypeOf<{ boards: Answer<'listBoards'> }>().toExtend<Output<typeof outputs.boards>>();
    expectTypeOf<Answer<'proposePin'>>().toExtend<Output<typeof outputs.pin>>();
    expectTypeOf<{ pins: Answer<'listPins'> }>().toExtend<Output<typeof outputs.pins>>();
    expectTypeOf<Answer<'getBatchStatus'>>().toExtend<Output<typeof outputs.batchStatus>>();
  });
});
