import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakePinComposer,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryListings,
  InMemoryMockups,
  InMemoryPins,
  RecordingAssetStore,
  SAMPLE_LINKS,
  SequentialIds,
} from '../testing/index.js';
import type { Mockup, MockupId } from '../mockups/mockup.js';
import { PlanPin, type PlanPinInput } from './plan-pin.js';

const MUG = 'design-01-mug' as DesignId;

const photo = (id: string, scenePrompt: string | null = null): Mockup => ({
  id: id as MockupId,
  designId: MUG,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: scenePrompt ? 'Scene' : 'Front',
  scenePrompt,
  sceneCheck: null,
  printConfirmed: scenePrompt !== null,
  sourceAsset: null,
  asset: {
    sha256: id,
    storageKey: `ab/${id}`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 1,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
});

const input = (overrides: Partial<PlanPinInput> = {}): PlanPinInput => ({
  designId: MUG,
  mockupId: 'm1',
  headline: ' Spooky season ',
  text: { title: ' Tulip mug ', description: 'Cosy mug.', altText: 'A white mug' },
  boardId: '5001',
  publishAt: new Date('2026-11-01T09:00:00.000Z'),
  proposed: false,
  ...overrides,
});

describe('PlanPin', () => {
  let folder: FakeSourceFolder;
  let composer: FakePinComposer;
  let listings: InMemoryListings;
  let pins: InMemoryPins;
  let plan: PlanPin;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    const mockups = new InMemoryMockups();
    await mockups.add([
      photo('m1'),
      photo('s1', 'kitchen table'),
      { ...photo('s2', 'beach towel'), printConfirmed: false },
      { ...photo('old'), designRevision: 0 },
    ]);
    folder = new FakeSourceFolder('/data');
    composer = new FakePinComposer(folder);
    listings = new InMemoryListings();
    pins = new InMemoryPins();
    plan = new PlanPin({
      query: catalog,
      mockups,
      listings,
      links: SAMPLE_LINKS,
      composer,
      inspector: folder,
      assets: Object.assign(new RecordingAssetStore(folder), {
        pathOf: (key: string) => `/data/${key}`,
      }),
      pins,
      clock: new FixedClock(),
      ids: new SequentialIds('pin'),
    });
  });

  it('makes the pin image from the photo and plans the pin', async () => {
    const pin = await plan.execute(input());

    expect(composer.requests).toEqual([
      { photo: { absolutePath: '/data/ab/m1', mimeType: 'image/png' }, headline: 'Spooky season' },
    ]);
    expect(pin).toMatchObject({
      id: 'pin-0001',
      designId: MUG,
      mockupId: 'm1',
      text: { title: 'Tulip mug', description: 'Cosy mug.', altText: 'A white mug' },
      headline: 'Spooky season',
      boardId: '5001',
      link: null,
      image: { mimeType: 'image/png', width: 1000, height: 1500 },
      aiModified: false,
      state: 'planned',
      publishedId: null,
    });
    expect(() => folder.contentAt('/data/pins/Spooky season.png')).toThrow(/ENOENT/);
    expect(await pins.listForDesign(MUG)).toEqual([pin]);
  });

  it('marks pins from scenes as AI made, links a published listing, and proposes for assistants', async () => {
    await listings.save(sampleListing(MUG, { state: 'active' }));

    const pin = await plan.execute(input({ mockupId: 's1', proposed: true }));

    expect(pin).toMatchObject({
      aiModified: true,
      link: 'https://shop.example/listing/1234567890',
      state: 'proposed',
    });
  });

  it.each<[string, Partial<PlanPinInput>]>([
    ['an empty title', { text: { title: ' ', description: '', altText: '' } }],
    ['a long title', { text: { title: 'x'.repeat(101), description: '', altText: '' } }],
    ['a long description', { text: { title: 't', description: 'x'.repeat(801), altText: '' } }],
    ['a long alt text', { text: { title: 't', description: '', altText: 'x'.repeat(501) } }],
    ['a long headline', { headline: 'x'.repeat(61) }],
    ['a board that is not an id', { boardId: 'cozy' }],
    ['a time that is not one', { publishAt: new Date('nope') }],
  ])('refuses %s before making an image', async (_case, overrides) => {
    await expect(plan.execute(input(overrides))).rejects.toBeInstanceOf(ValidationError);
    expect(composer.requests).toEqual([]);
  });

  it('refuses a time more than a few minutes ago', async () => {
    await expect(
      plan.execute(input({ publishAt: new Date('2025-12-31T23:54:00.000Z') })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      plan.execute(input({ publishAt: new Date('2025-12-31T23:56:00.000Z') })),
    ).resolves.toMatchObject({ state: 'planned' });
  });

  it('needs a photo of the design', async () => {
    await expect(plan.execute(input({ mockupId: 'gone' }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses a scene whose print the seller has not confirmed', async () => {
    await expect(plan.execute(input({ mockupId: 's2', proposed: true }))).rejects.toMatchObject({
      details: { field: 'mockupId' },
    });
    expect(composer.requests).toEqual([]);
  });

  it('refuses a photo of an earlier version of the artwork', async () => {
    await expect(plan.execute(input({ mockupId: 'old' }))).rejects.toThrow(
      'photo old shows an earlier version of the artwork',
    );
    expect(composer.requests).toEqual([]);
  });

  it('refuses an image the composer did not make', async () => {
    composer.compose = (request) => {
      folder.write({ relativePath: 'pins/bad.png', content: request.headline, image: null });
      return Promise.resolve({
        absolutePath: '/data/pins/bad.png',
        dispose: () => Promise.resolve(),
      });
    };

    await expect(plan.execute(input())).rejects.toThrow(/not a PNG or JPEG/);
  });
});
