import { LISTING_RULES } from '@pod/rules';
import type { DesignId } from '../catalog/model.js';
import {
  CreateListingDraft,
  type CreateListingDraftInput,
} from '../listing/create-listing-draft.js';
import { DraftGuard } from '../listing/draft-guard.js';
import type { Mockup, MockupId } from '../mockups/mockup.js';
import { CheckDesignPrint } from '../print/check-design-print.js';
import type { PrintProduct } from '../print/print-product.js';
import { FixedClock, SequentialIds } from './fakes.js';
import { InMemoryCatalog } from './in-memory-catalog.js';
import { FakeMarketplace, InMemoryListings } from './listing-fakes.js';
import { InMemoryDraftChecks } from './batch-fakes.js';
import { InMemoryMockups } from './in-memory-mockups.js';
import { FakePrintCatalog, SAMPLE_MUG, SAMPLE_SHIRT } from './print-catalog-fakes.js';
import { sampleConcept, sampleDesign } from './contract/index.js';

export const SHIRT = 'design-01-t-shirt' as DesignId;

/** A Printful photo of the sample shirt's current revision. */
export function shirtPhoto(id: string, printArea = 'front'): Mockup {
  return {
    id: id as MockupId,
    designId: SHIRT,
    designRevision: 1,
    variantId: '4000',
    printArea,
    view: 'Front',
    scenePrompt: null,
    sceneCheck: null,
    printConfirmed: false,
    sourceAsset: null,
    asset: {
      sha256: id,
      storageKey: `ab/${id}`,
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      byteSize: 10,
    },
    createdAt: new Date('2026-10-24T10:00:00.000Z'),
  };
}

/** A valid draft of the sample shirt, with `overrides`. */
export const draftInput = (
  overrides: Partial<CreateListingDraftInput> = {},
): CreateListingDraftInput => ({
  designId: SHIRT,
  fit: 'contain',
  language: 'en-US',
  text: { title: 'Lantern Harbor Tee', description: 'Spooky.', tags: ['tulip shirt'] },
  price: 2499,
  currency: 'USD',
  variantIds: ['4000', '4001', '4010'],
  mockupIds: ['m2', 'm1'],
  shippingProfileId: '316',
  readinessStateId: '151',
  returnPolicyId: '1518',
  productionPartnerIds: ['77'],
  ...overrides,
});

export interface ListingDraftFixture {
  readonly create: CreateListingDraft;
  readonly marketplace: FakeMarketplace;
  readonly listings: InMemoryListings;
  readonly draftChecks: InMemoryDraftChecks;
  /** Whether the seller's designs are made with AI tools; false to start with. */
  madeWithAi: boolean;
}

/**
 * Drafting the sample shirt, which has Printful photos m1 and m2, a confirmed
 * scene m3, an unconfirmed one m4 and a photo `old` of an earlier revision.
 */
export async function listingDraftFixture(
  products: readonly PrintProduct[] = [SAMPLE_MUG, SAMPLE_SHIRT],
): Promise<ListingDraftFixture> {
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
  await catalog.designs.save(sampleDesign('01-t-shirt'));
  const mockups = new InMemoryMockups();
  await mockups.replace(SHIRT, { variantId: '4000', printArea: 'front' }, [
    shirtPhoto('m1'),
    shirtPhoto('m2'),
    { ...shirtPhoto('m3'), scenePrompt: 'On a reading chair', printConfirmed: true },
    { ...shirtPhoto('m4'), scenePrompt: 'On a beach towel' },
    { ...shirtPhoto('old'), designRevision: 0 },
  ]);
  const marketplace = new FakeMarketplace();
  const listings = new InMemoryListings();
  const draftChecks = new InMemoryDraftChecks();
  const fixture: { -readonly [K in keyof ListingDraftFixture]: ListingDraftFixture[K] } = {
    marketplace,
    listings,
    draftChecks,
    madeWithAi: false,
    create: new CreateListingDraft({
      checkPrint: new CheckDesignPrint(catalog, new FakePrintCatalog(products)),
      mockups,
      assets: { pathOf: (key) => `/data/${key}` },
      marketplace,
      listings,
      disclosure: { designsMadeWithAi: () => Promise.resolve(fixture.madeWithAi) },
      guard: new DraftGuard(draftChecks, (error) => {
        throw error;
      }),
      clock: new FixedClock(),
      ids: new SequentialIds('listing'),
      rules: LISTING_RULES,
    }),
  };
  return fixture;
}
