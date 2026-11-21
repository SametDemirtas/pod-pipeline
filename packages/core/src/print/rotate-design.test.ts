import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design, DesignId } from '../catalog/model.js';
import { PrintFileTooLargeError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import {
  FakeImagePreviews,
  FakeImageRotator,
  FakeRotationAdvisor,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  RecordingAssetStore,
} from '../testing/index.js';
import { RotateDesign, type ListedAreas, type RotateDesignInput } from './rotate-design.js';

const BLANKET = 'design-01-blanket' as DesignId;
const MUG = 'design-01-mug' as DesignId;
/** The 50″×60″ blanket's area: wider than tall. */
const LANDSCAPE = { placement: 'default', width: 9450, height: 7950, dpi: 150 };
const PORTRAIT_ART = {
  sha256: 'sha-01-blanket',
  storageKey: 'assets/sha-01-blanket',
  mimeType: 'image/png',
  width: 9450,
  height: 11813,
  byteSize: 1024,
} as const;

describe('RotateDesign', () => {
  let folder: FakeSourceFolder;
  let catalog: InMemoryCatalog;
  let advisor: FakeRotationAdvisor;
  let rotator: FakeImageRotator;
  let previews: FakeImagePreviews;
  let rotate: RotateDesign;

  const input = ({
    printAreas = [LANDSCAPE],
    printTargets,
    ...changes
  }: Partial<ListedAreas & Omit<RotateDesignInput, 'listedAreas'>> = {}): RotateDesignInput => ({
    designId: BLANKET,
    listedAreas: () => Promise.resolve({ printAreas, printTargets }),
    ...changes,
  });

  async function saveArtwork(design: Design): Promise<void> {
    await catalog.designs.save(design);
    folder.write({
      relativePath: design.asset.storageKey,
      content: `artwork ${design.designKey}`,
      image: { ...design.asset },
    });
  }

  beforeEach(async () => {
    folder = new FakeSourceFolder('/data');
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await saveArtwork(sampleDesign('01-blanket', { asset: PORTRAIT_ART }));
    advisor = new FakeRotationAdvisor();
    rotator = new FakeImageRotator(folder);
    previews = new FakeImagePreviews();
    rotate = new RotateDesign({
      query: catalog,
      designs: catalog.designs,
      previews,
      advisor,
      rotator,
      assets: Object.assign(new RecordingAssetStore(folder), {
        pathOf: (key: string) => `/data/${key}`,
      }),
      clock: new FixedClock(new Date('2026-11-06T09:00:00.000Z')),
    });
  });

  it('asks which way keeps portrait artwork upright and keeps it turned as the next revision', async () => {
    const stop = new AbortController();

    const result = await rotate.execute(input({ signal: stop.signal }));

    expect(advisor.questions).toEqual([
      {
        artwork: previews.image,
        artworkOrientation: 'portrait',
        areaOrientation: 'landscape',
        product: 'blanket',
      },
    ]);
    expect(rotator.requests).toEqual([
      { source: '/data/assets/sha-01-blanket', turn: 90, signal: stop.signal },
    ]);
    expect(result).toMatchObject({
      status: 'rotated',
      reason: 'The figure stands upright on the hung blanket.',
      design: {
        revision: 2,
        asset: { width: 11813, height: 9450, mimeType: 'image/png' },
        rotation: {
          degrees: 90,
          originalSha256: 'sha-01-blanket',
          reason: 'The figure stands upright on the hung blanket.',
        },
        updatedAt: new Date('2026-11-06T09:00:00.000Z'),
      },
    });
    const details = await catalog.getDesign(BLANKET);
    expect(details?.revisions.map((revision) => revision.revision)).toEqual([2, 1]);
    expect(() => folder.contentAt('/data/turned/1.png')).toThrow('ENOENT');
  });

  it('keeps the upscaled copy and the imported file it came from', async () => {
    const upscaled = sampleDesign('01-blanket', {
      revision: 2,
      asset: { ...PORTRAIT_ART, sha256: 'sha-big', storageKey: 'assets/sha-big' },
      upscale: { model: 'illustration', originalSha256: 'sha-01-blanket' },
    });
    await saveArtwork(upscaled);
    advisor.advice = { degrees: 270, reason: 'Reads upright turned the other way.' };

    const result = await rotate.execute(input());

    expect(rotator.requests[0]).toMatchObject({ source: '/data/assets/sha-big', turn: 270 });
    expect(result.design).toMatchObject({
      revision: 3,
      upscale: upscaled.upscale,
      rotation: { degrees: 270, originalSha256: 'sha-01-blanket' },
    });
  });

  it('leaves artwork the model says to keep as it is, with its reason', async () => {
    advisor.advice = { degrees: 0, reason: 'A repeating pattern with no top.' };

    const result = await rotate.execute(input());

    expect(result).toMatchObject({
      status: 'kept',
      reason: 'A repeating pattern with no top.',
      design: { revision: 1 },
    });
    expect(rotator.requests).toEqual([]);
  });

  it('remembers artwork left as it is and does not ask again for the same imported file', async () => {
    advisor.advice = { degrees: 0, reason: 'A repeating pattern with no top.' };
    await rotate.execute(input());

    const again = await rotate.execute(input());

    expect(advisor.questions).toHaveLength(1);
    expect(again).toMatchObject({ status: 'kept', reason: 'A repeating pattern with no top.' });
    expect((await catalog.getDesign(BLANKET))?.design.keptOrientation).toEqual({
      sha256: 'sha-01-blanket',
      reason: 'A repeating pattern with no top.',
    });
  });

  it('asks again once other artwork was imported in its place', async () => {
    advisor.advice = { degrees: 0, reason: 'A repeating pattern with no top.' };
    await rotate.execute(input());
    await saveArtwork({
      ...sampleDesign('01-blanket'),
      revision: 2,
      asset: { ...PORTRAIT_ART, sha256: 'sha-new', storageKey: 'assets/sha-new' },
    });

    await rotate.execute(input());

    expect(advisor.questions).toHaveLength(2);
  });

  it.each([
    ['artwork that fits the area already', input({ printAreas: [{ ...LANDSCAPE, width: 7000 }] })],
    [
      'a size whose area fits the artwork',
      input({ printAreas: [LANDSCAPE, { ...LANDSCAPE, width: 7000 }] }),
    ],
    ['no listed size', input({ printAreas: [] })],
  ])('asks nothing for %s', async (_case, request) => {
    expect((await rotate.execute(request)).status).toBe('unneeded');
    expect(advisor.questions).toEqual([]);
  });

  it('never turns artwork twice', async () => {
    await rotate.execute(input());
    await saveArtwork({
      ...sampleDesign('01-blanket'),
      revision: 3,
      asset: { ...PORTRAIT_ART, sha256: 'sha-odd', storageKey: 'assets/sha-odd' },
      rotation: { degrees: 90, originalSha256: 'sha-01-blanket', reason: 'Turned.' },
    });

    expect((await rotate.execute(input())).status).toBe('unneeded');
    expect(advisor.questions).toHaveLength(1);
  });

  it('leaves products that are not turned, such as a mug, alone without finding their areas', async () => {
    await saveArtwork(
      sampleDesign('01-mug', { asset: { ...PORTRAIT_ART, storageKey: 'assets/m' } }),
    );
    const listedAreas = vi.fn(() => Promise.resolve({ printAreas: [LANDSCAPE] }));

    expect((await rotate.execute({ designId: MUG, listedAreas })).status).toBe('unneeded');
    expect(listedAreas).not.toHaveBeenCalled();
    expect(advisor.questions).toEqual([]);
  });

  it('refuses JPEG artwork before asking', async () => {
    await saveArtwork({
      ...sampleDesign('01-blanket'),
      revision: 2,
      asset: { ...PORTRAIT_ART, mimeType: 'image/jpeg', storageKey: 'assets/j' },
    });

    await expect(rotate.execute(input())).rejects.toBeInstanceOf(ValidationError);
    expect(advisor.questions).toEqual([]);
  });

  it('refuses a turned file too large to print and stores nothing', async () => {
    rotator.byteSize = 120_000_000;

    await expect(rotate.execute(input())).rejects.toBeInstanceOf(PrintFileTooLargeError);
    expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(1);
  });

  describe('when the provider takes the area turned a quarter', () => {
    const target = { productId: '395', variantId: '10986', area: LANDSCAPE };
    let answers: boolean[];

    const upright = () =>
      new RotateDesign({
        query: catalog,
        designs: catalog.designs,
        previews,
        advisor,
        rotator,
        assets: Object.assign(new RecordingAssetStore(folder), {
          pathOf: (key: string) => `/data/${key}`,
        }),
        clock: new FixedClock(),
        orientation: {
          supportsOrientation: () => Promise.resolve(answers.shift() ?? false),
        },
      });

    beforeEach(() => {
      answers = [true, true];
    });

    it('leaves the artwork as it is, to print upright on every listed area', async () => {
      const result = await upright().execute(
        input({ printTargets: [target, { ...target, variantId: '13222' }] }),
      );

      expect(result.status).toBe('unneeded');
      expect(advisor.questions).toEqual([]);
      expect(rotator.requests).toEqual([]);
      expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(1);
    });

    it('still turns the artwork when one listed area cannot be turned', async () => {
      answers = [true, false];

      const result = await upright().execute(
        input({ printTargets: [target, { ...target, variantId: '13222' }] }),
      );

      expect(result.status).toBe('rotated');
    });

    it('turns as before when the listed areas are not given', async () => {
      expect((await upright().execute(input())).status).toBe('rotated');
    });
  });
});
