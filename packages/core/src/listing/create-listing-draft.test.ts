import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { ConflictError, DraftLeftBehindError, NotFoundError } from '../errors.js';
import {
  FakeMarketplace,
  type InMemoryDraftChecks,
  type InMemoryListings,
} from '../testing/index.js';
import {
  draftInput as input,
  listingDraftFixture,
  SHIRT,
  type ListingDraftFixture,
} from '../testing/listing-draft-fixture.js';
import type { CreateListingDraft } from './create-listing-draft.js';
import type * as DraftParts from './draft-parts.js';

const report = vi.hoisted(() => ({ fails: false }));
vi.mock('./draft-parts.js', async (original) => {
  const parts = await original<typeof DraftParts>();
  return {
    ...parts,
    draftReport: (...args: Parameters<typeof parts.draftReport>) => {
      if (report.fails) throw new Error('report broke');
      return parts.draftReport(...args);
    },
  };
});

const designId = (key: string) => `design-${key}` as DesignId;

describe('CreateListingDraft', () => {
  let fixture: ListingDraftFixture;
  let marketplace: FakeMarketplace;
  let listings: InMemoryListings;
  let create: CreateListingDraft;
  let draftChecks: InMemoryDraftChecks;

  beforeEach(async () => {
    report.fails = false;
    fixture = await listingDraftFixture();
    ({ create, marketplace, listings, draftChecks } = fixture);
  });

  it('creates the draft with its variations and photos and remembers it', async () => {
    const { listing, trademarks, aiTells } = await create.execute(input());

    expect(trademarks).toEqual([]);
    expect(aiTells).toEqual([]);
    expect(marketplace.drafts.get('9000')).toMatchObject({
      familyId: 't-shirt',
      text: { title: 'Lantern Harbor Tee', description: 'Spooky.', tags: ['tulip shirt'] },
      price: 2499,
      currency: 'USD',
      shippingProfileId: '316',
      productionPartnerIds: ['77'],
    });
    expect(marketplace.products.get('9000')?.map((product) => product.sku)).toEqual([
      'PF-4000',
      'PF-4001',
      'PF-4010',
    ]);
    expect(marketplace.images.get('9000')).toEqual([
      { absolutePath: '/data/ab/m2', mimeType: 'image/png' },
      { absolutePath: '/data/ab/m1', mimeType: 'image/png' },
    ]);
    expect(listing).toEqual({
      id: 'listing-0001',
      designId: SHIRT,
      designRevision: 1,
      marketplaceId: '9000',
      state: 'draft',
      printArea: 'front',
      fit: 'contain',
      products: [
        { sku: 'PF-4000', productId: 'p-PF-4000', variantId: '4000' },
        { sku: 'PF-4001', productId: 'p-PF-4001', variantId: '4001' },
        { sku: 'PF-4010', productId: 'p-PF-4010', variantId: '4010' },
      ],
      linkedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      publishedAt: null,
    });
    expect(await listings.findByDesign(SHIRT)).toEqual(listing);
  });

  it('writes the translations with the draft', async () => {
    await create.execute(
      input({
        translations: [
          {
            language: 'de',
            text: { title: ' Geister Shirt ', description: 'Gruselig.', tags: [] },
          },
        ],
      }),
    );

    expect(marketplace.translations.get('9000/de')).toEqual({
      title: 'Geister Shirt',
      description: 'Gruselig.',
      tags: [],
    });
  });

  it('removes the draft when a translation cannot be written', async () => {
    marketplace.setTranslation = () => Promise.reject(new Error('Language not supported'));
    const translations = [{ language: 'xx', text: { title: 'T', description: 'D', tags: [] } }];

    await expect(create.execute(input({ translations }))).rejects.toThrow('Language not supported');
    expect(marketplace.removed).toEqual(['9000']);
  });

  it('makes the draft but names trademarks in the title or tags of any language', async () => {
    const { trademarks } = await create.execute(
      input({
        text: { title: 'Star Wars Tee', description: 'Bella+Canvas blank.', tags: ['tulip'] },
        translations: [
          {
            language: 'de',
            text: { title: 'Geister-Shirt', description: 'D.', tags: ['NFL Fan'] },
          },
        ],
      }),
    );

    expect(trademarks).toEqual(['Star Wars', 'NFL']);
    expect(marketplace.drafts.has('9000')).toBe(true);
  });

  it('makes the draft but names machine-written phrases in each language, not the AI note', async () => {
    const { aiTells } = await create.execute(
      input({
        mockupIds: ['m3', 'm1'],
        text: { title: 'Tulip Tee', description: 'Elevate your style.', tags: ['tulip'] },
        translations: [
          {
            language: 'de',
            text: { title: 'Geister-Shirt', description: 'Handgemacht.', tags: [] },
          },
        ],
      }),
    );

    expect(aiTells).toEqual([
      { language: 'en-US', category: 'hype', field: 'description', match: 'Elevate your' },
      { language: 'de', category: 'hype', field: 'description', match: 'Handgemacht' },
    ]);
    expect(marketplace.drafts.has('9000')).toBe(true);
  });

  it('says in every language when a chosen photo is an AI scene', async () => {
    await create.execute(
      input({
        mockupIds: ['m3', 'm1'],
        translations: [
          { language: 'de', text: { title: 'Geister-Shirt', description: 'Gruselig.', tags: [] } },
        ],
      }),
    );

    expect(marketplace.drafts.get('9000')?.text.description).toBe(
      'Spooky.\n\nSome photos are AI-generated scenes. Props in them are not included.',
    );
    expect(marketplace.translations.get('9000/de')?.description).toBe(
      'Gruselig.\n\nEinige Fotos sind KI-generierte Szenen. Die Dekoration darin ist nicht im Lieferumfang enthalten.',
    );
  });

  it('discloses AI-made designs in every language, in one sentence with AI scenes', async () => {
    fixture.madeWithAi = true;
    const german = {
      language: 'de',
      text: { title: 'Geister-Shirt', description: 'Gruselig.', tags: [] },
    };
    const first = await create.execute(input({ translations: [german] }));
    await listings.remove(first.listing.id);
    await create.execute(input({ mockupIds: ['m3'], translations: [german] }));

    expect(marketplace.drafts.get('9000')?.text.description).toBe(
      'Spooky.\n\nThis design was created with the help of AI tools from my own ideas and prompts.',
    );
    expect(marketplace.translations.get('9000/de')?.description).toBe(
      'Gruselig.\n\nDieses Design wurde mit Hilfe von KI-Tools nach meinen eigenen Ideen und Vorgaben erstellt.',
    );
    expect(marketplace.drafts.get('9001')?.text.description).toBe(
      'Spooky.\n\nThis design was created with the help of AI tools from my own ideas and ' +
        'prompts, and some photos are AI-generated scenes whose props are not included.',
    );
  });

  it('prints on the chosen area', async () => {
    expect((await create.execute(input({ printArea: 'back' }))).listing.printArea).toBe('back');
  });

  it.each([
    ['setProducts', 'Etsy is down'],
    ['addImages', 'image too large'],
  ] as const)('removes the half-made draft when %s fails', async (step, failure) => {
    marketplace.failOn = step;

    await expect(create.execute(input())).rejects.toThrow(failure);
    expect(marketplace.removed).toEqual(['9000']);
    expect(await listings.findByDesign(SHIRT)).toBeUndefined();
  });

  it('removes the draft when it cannot be remembered', async () => {
    listings.save = () => Promise.reject(new Error('disk full'));

    await expect(create.execute(input())).rejects.toThrow('disk full');
    expect(marketplace.removed).toEqual(['9000']);
  });

  it('names the draft left in the shop when it cannot be removed either', async () => {
    marketplace.failOn = 'addImages';
    marketplace.remove = () => Promise.reject(new Error('Etsy is down'));

    const error = await create.execute(input()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DraftLeftBehindError);
    expect(error).toMatchObject({
      code: 'DRAFT_LEFT_BEHIND',
      details: { marketplaceId: '9000' },
      cause: new Error('image too large'),
    });
  });

  describe('marks the design while its draft is made', () => {
    const marks = async () => [...(await draftChecks.all()).values()].map((check) => check.code);

    it('before asking Etsy, and unmarks it once the listing is stored', async () => {
      const createDraft = marketplace.createDraft.bind(marketplace);
      let markedThen: string[] = [];
      marketplace.createDraft = async (listing) => {
        markedThen = await marks();
        return createDraft(listing);
      };

      await create.execute(input());

      expect(markedThen).toEqual(['DRAFT_UNCONFIRMED']);
      expect(await marks()).toEqual([]);
    });

    it('not at all when it stops before asking Etsy', async () => {
      await expect(create.execute(input({ mockupIds: ['gone'] }))).rejects.toBeInstanceOf(
        NotFoundError,
      );

      expect(await marks()).toEqual([]);
    });

    it('and asks Etsy nothing when the mark cannot be stored', async () => {
      draftChecks.set = () => Promise.reject(new Error('disk full'));

      await expect(create.execute(input())).rejects.toThrow('disk full');
      expect(marketplace.drafts.size).toBe(0);
    });

    it('and unmarks it when Etsy refused the draft or it was removed again', async () => {
      const createDraft = marketplace.createDraft.bind(marketplace);
      marketplace.createDraft = () => Promise.reject(new Error('invalid shipping profile'));
      await expect(create.execute(input())).rejects.toThrow('invalid shipping profile');
      expect(await marks()).toEqual([]);

      marketplace.createDraft = createDraft;
      marketplace.failOn = 'addImages';
      await expect(create.execute(input())).rejects.toThrow('image too large');
      expect(marketplace.removed).toEqual(['9000']);
      expect(await marks()).toEqual([]);

      marketplace.failOn = undefined;
      listings.save = () => Promise.reject(new Error('disk full'));
      await expect(create.execute(input())).rejects.toThrow('disk full');
      expect(marketplace.removed).toEqual(['9000', '9001']);
      expect(await marks()).toEqual([]);
    });

    it('and keeps the mark when Etsy may hold the draft', async () => {
      const unconfirmed = Object.assign(new Error('answer broke off'), {
        code: 'DRAFT_UNCONFIRMED',
        details: {},
      });
      marketplace.createDraft = () => Promise.reject(unconfirmed);
      await expect(create.execute(input())).rejects.toBe(unconfirmed);
      expect(await marks()).toEqual(['DRAFT_UNCONFIRMED']);

      await draftChecks.clear(designId('01-t-shirt'));
      marketplace.createDraft = (listing) => new FakeMarketplace().createDraft(listing);
      marketplace.failOn = 'addImages';
      marketplace.remove = () => Promise.reject(new Error('Etsy is down'));
      await expect(create.execute(input())).rejects.toBeInstanceOf(DraftLeftBehindError);
      expect([...(await draftChecks.all()).values()]).toEqual([
        expect.objectContaining({ code: 'DRAFT_LEFT_BEHIND', details: { marketplaceId: '9000' } }),
      ]);
    });

    it('refuses a marked design until the seller checked, asking Etsy nothing', async () => {
      await draftChecks.set(designId('01-t-shirt'), {
        step: 'draft',
        code: 'DRAFT_LEFT_BEHIND',
        message: 'left',
        details: { marketplaceId: '77' },
      });

      await expect(create.execute(input())).rejects.toMatchObject({
        code: 'DRAFTS_NOT_CHECKED',
        details: { marketplaceId: '77' },
      });
      expect(marketplace.drafts.size).toBe(0);
      await draftChecks.clear(designId('01-t-shirt'));
      await expect(create.execute(input())).resolves.toMatchObject({
        listing: { marketplaceId: '9000', state: 'draft' },
      });
    });
  });

  it('refuses a second draft of a design while the first is being made', async () => {
    const first = create.execute(input());
    const second = create.execute(input()).catch((error: unknown) => error);

    expect(await second).toBeInstanceOf(ConflictError);
    await expect(first).resolves.toMatchObject({ listing: { marketplaceId: '9000' } });
    expect(marketplace.drafts.size).toBe(1);
  });

  it('keeps a stored draft when reporting on its words fails', async () => {
    report.fails = true;

    await expect(create.execute(input())).rejects.toThrow('report broke');
    expect(marketplace.removed).toEqual([]);
    expect(await listings.findByDesign(SHIRT)).toMatchObject({ marketplaceId: '9000' });
    expect([...(await draftChecks.all()).keys()]).toEqual([]);
  });

  it('removes the draft when the marketplace lost a product', async () => {
    const setProducts = marketplace.setProducts.bind(marketplace);
    marketplace.setProducts = async (...args) => (await setProducts(...args)).slice(1);

    await expect(create.execute(input())).rejects.toThrow(/did not create PF-4000/);
    expect(marketplace.removed).toEqual(['9000']);
  });
});
