import { isAbsolute } from 'node:path';
import { z } from 'zod';
// The full entry, unlike `/client`, has the zod schemas the tool inputs reuse.
import {
  AI_TELL_CATEGORIES,
  BATCH_JOB_STATES,
  BATCH_STEPS,
  fields,
  LISTING_STATES,
  PIN_STATES,
  PRINT_QUALITIES,
  RESEARCH_MARKETS,
} from '@pod/contracts';

/** Tool inputs: the app's own request fields, and folders as absolute paths. */
export const inputs = {
  ...fields,
  folder: fields.folder.refine(isAbsolute, { message: 'Must be an absolute path' }),
  researchMarket: z.enum(RESEARCH_MARKETS),
};

const pin = z.looseObject({
  id: z.string(),
  designId: z.string(),
  title: z.string(),
  boardId: z.string(),
  publishAt: z.string(),
  state: z.enum(PIN_STATES),
  publishedUrl: z.string().nullable(),
  failure: z.string().nullable(),
});

/** The design a tool is about, as every tool names it. */
export const DESIGN = { design_id: inputs.designId.describe('Design id from list_designs') };

const listing = z.looseObject({
  designId: z.string(),
  listingId: z.string(),
  state: z.enum(LISTING_STATES),
  editUrl: z.string(),
  linkedAt: z.string().nullable(),
  linkCurrent: z.boolean(),
});
const shopOption = z.object({ id: z.string(), label: z.string() });

/** Tool outputs. Only the fields an assistant relies on are spelled out. */
export const outputs = {
  families: { families: z.array(z.object({ id: z.string() })) },
  folders: { folders: z.array(z.string()) },
  designPage: {
    items: z.array(z.looseObject({ id: z.string(), designKey: z.string() })),
    nextCursor: z.string().nullable(),
    total: z.number().int(),
  },
  design: z.looseObject({
    id: z.string(),
    designKey: z.string(),
    revisions: z.array(z.looseObject({ revision: z.number().int() })),
  }),
  preview: z.looseObject({
    rootPath: z.string(),
    fingerprint: z.string(),
    counts: z.object({
      new: z.number().int(),
      changed: z.number().int(),
      unchanged: z.number().int(),
      skipped: z.number().int(),
    }),
  }),
  printCheck: z.looseObject({
    designId: z.string(),
    variantId: z.string(),
    printArea: z.string(),
    area: z
      .object({ placement: z.string(), width: z.number(), height: z.number(), dpi: z.number() })
      .nullable(),
    effectiveDpi: z.number(),
    quality: z.enum(PRINT_QUALITIES),
    variants: z.array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        color: z.string().nullable(),
        size: z.string().nullable(),
        areas: z.array(z.string()),
      }),
    ),
    productFacts: z.object({
      material: z.string(),
      care: z.string(),
      fit: z.string(),
      size: z.string(),
    }),
  }),
  mockups: {
    mockups: z.array(
      z.looseObject({
        id: z.string(),
        variantId: z.string(),
        printArea: z.string(),
        view: z.string(),
        scenePrompt: z.string().nullable(),
        printConfirmed: z.boolean(),
        createdAt: z.string(),
      }),
    ),
  },
  shopOptions: {
    shopName: z.string(),
    currency: z.string(),
    currencyDigits: z.number(),
    shippingProfiles: z.array(shopOption),
    readinessStates: z.array(shopOption),
    returnPolicies: z.array(shopOption),
    productionPartners: z.array(shopOption),
    languages: z.array(z.string()),
  },
  listing,
  createdListing: listing.extend({
    trademarks: z.array(z.string()),
    aiTells: z.array(
      z.object({
        language: z.string(),
        category: z.enum(AI_TELL_CATEGORIES),
        field: z.enum(['title', 'description', 'tags']),
        match: z.string(),
      }),
    ),
  }),
  listingOrNone: { listing: listing.nullable() },
  listingPhotos: {
    marketplace: z.array(
      z.object({ url: z.string(), width: z.number().nullable(), height: z.number().nullable() }),
    ),
    print: z.array(z.object({ kind: z.string(), url: z.string() })).nullable(),
  },
  researchRun: z.looseObject({
    id: z.string(),
    query: z.string(),
    market: z.enum(RESEARCH_MARKETS),
    createdAt: z.string(),
    report: z.looseObject({
      terms: z.array(
        z.object({
          term: z.string(),
          listings: z.number(),
          shops: z.number(),
          ads: z.number(),
          share: z.number(),
          suggested: z.boolean(),
          trademark: z.boolean(),
          adOnly: z.boolean(),
        }),
      ),
      suggestions: z.array(z.string()),
      suggestionsAvailable: z.boolean(),
      warnings: z.array(z.string()),
      suggestedTags: z.array(z.string()),
      writerWords: z.array(
        z.object({ term: z.string(), suggested: z.boolean(), shops: z.number() }),
      ),
    }),
  }),
  boards: { boards: z.array(z.object({ id: z.string(), name: z.string() })) },
  pin,
  pins: { pins: z.array(pin) },
  researchList: {
    runs: z.array(
      z.looseObject({
        id: z.string(),
        query: z.string(),
        market: z.enum(RESEARCH_MARKETS),
        topTerms: z.array(z.string()),
      }),
    ),
  },
  batchStatus: {
    job: z
      .looseObject({
        state: z.enum(BATCH_JOB_STATES),
        steps: z.array(z.enum(BATCH_STEPS)),
        designs: z.number().int(),
        settledDesigns: z.number().int(),
        current: z.object({ designKey: z.string(), step: z.enum(BATCH_STEPS) }).nullable(),
        failures: z.array(
          z.object({
            designId: z.string(),
            designKey: z.string(),
            step: z.enum(BATCH_STEPS),
            error: z.looseObject({ code: z.string(), message: z.string() }),
          }),
        ),
      })
      .nullable(),
  },
  importResult: {
    created: z.array(z.string()),
    updated: z.array(z.string()),
    unchanged: z.number().int(),
    skipped: z.number().int(),
    renamedConceptKeys: z.array(z.string()),
  },
};
