import { beforeEach, describe, expect, it } from 'vitest';
import type { Design, DesignId } from '../catalog/model.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import {
  FakeImageRotator,
  FakeImageScaler,
  FakePrintCatalog,
  FakeSourceFolder,
  FakeUpscaler,
  FixedClock,
  InMemoryCatalog,
  RecordingAssetStore,
} from '../testing/index.js';
import { MAX_PRINT_FILE_BYTES } from './print-file-size.js';
import { CheckDesignPrint } from './check-design-print.js';
import type { PrintArea, PrintProduct } from './print-product.js';
import type { UprightTargetQuery } from './upright-target.js';
import {
  UpscaleDesign,
  type UpscaleDesignDeps,
  type UpscaleDesignInput,
} from './upscale-design.js';

const BLANKET = 'design-01-blanket' as DesignId;
/** Wider than tall, like the sample artwork of 3840 × 1648. */
const AREA = { placement: 'default', width: 9000, height: 3000, dpi: 150 };
/** The same area as the provider lists it for portrait artwork turned to fit it. */
const TALL = { placement: 'default', width: 3000, height: 9000, dpi: 150 };
const TURN = { degrees: 90, originalSha256: 'sha-01-blanket', reason: 'Upright.' } as const;

/** One listed variant per area. */
function on(...areas: PrintArea[]): UprightTargetQuery[] {
  return areas.map((area, index) => ({ productId: '395', variantId: String(index + 1), area }));
}

/** The imported landscape artwork turned to stand on end, as a turn stores it. */
function turnedRevision(changes: Partial<Design> = {}): Design {
  const imported = sampleDesign('01-blanket');
  return {
    ...imported,
    revision: 2,
    asset: { ...imported.asset, sha256: 'sha-turned', storageKey: 'k', width: 1648, height: 3840 },
    rotation: TURN,
    ...changes,
  };
}

describe('UpscaleDesign', () => {
  let folder: FakeSourceFolder;
  let catalog: InMemoryCatalog;
  let upscaler: FakeUpscaler;
  let scaler: FakeImageScaler;
  let rotator: FakeImageRotator;
  let assets: RecordingAssetStore & { pathOf: (key: string) => string };
  let upscale: UpscaleDesign;

  const input = (changes: Partial<UpscaleDesignInput> = {}): UpscaleDesignInput => ({
    designId: BLANKET,
    model: 'illustration',
    printTargets: on(AREA),
    fit: 'cover',
    ...changes,
  });

  beforeEach(async () => {
    folder = new FakeSourceFolder('/data');
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-blanket'));
    upscaler = new FakeUpscaler(folder);
    scaler = new FakeImageScaler(folder);
    rotator = new FakeImageRotator(folder);
    assets = Object.assign(new RecordingAssetStore(folder), {
      pathOf: (key: string) => `/data/${key}`,
    });
    upscale = new UpscaleDesign(deps());
  });

  const deps = (changes: Partial<UpscaleDesignDeps> = {}): UpscaleDesignDeps => ({
    query: catalog,
    unitOfWork: catalog,
    upscaler,
    scaler,
    rotator,
    assets,
    inspector: folder,
    clock: new FixedClock(new Date('2026-10-31T09:00:00.000Z')),
    ...changes,
  });

  it('keeps a copy as large as the listed sizes need as the next revision', async () => {
    const progress: number[] = [];

    const design = await upscale.execute(input({ onProgress: (share) => progress.push(share) }));

    expect(scaler.requests).toEqual([
      { source: '/data/upscaled/1.png', size: { width: 9000, height: 3863 }, signal: undefined },
    ]);
    expect(design.revision).toBe(2);
    expect(design.asset).toMatchObject({ width: 9000, height: 3863, mimeType: 'image/png' });
    expect(design.upscale).toEqual({ model: 'illustration', originalSha256: 'sha-01-blanket' });
    expect(design.updatedAt).toEqual(new Date('2026-10-31T09:00:00.000Z'));
    expect(upscaler.requests[0]).toMatchObject({
      image: { absolutePath: '/data/assets/sha-01-blanket', mimeType: 'image/png' },
      model: 'illustration',
    });
    expect(progress).toEqual([1]);
    const details = await catalog.getDesign(BLANKET);
    expect(details?.design.asset.storageKey).toBe(assets.stored[0]?.storageKey);
    expect(details?.revisions.map((revision) => revision.revision)).toEqual([2, 1]);
  });

  it('passes the stop signal on to the engine and the scaling', async () => {
    const stop = new AbortController();

    await upscale.execute(input({ signal: stop.signal }));

    expect(upscaler.requests[0]?.signal).toBe(stop.signal);
    expect(scaler.requests[0]?.signal).toBe(stop.signal);
  });

  it('removes both temporary files once the artwork is stored', async () => {
    await upscale.execute(input());

    expect(() => folder.contentAt('/data/upscaled/1.png')).toThrow('ENOENT');
    expect(() => folder.contentAt('/data/scaled/1.png')).toThrow('ENOENT');
  });

  it('stores the copy even when a temporary file cannot be removed', async () => {
    const upscaleOne = upscaler.upscale.bind(upscaler);
    upscaler.upscale = async (request) => ({
      ...(await upscaleOne(request)),
      dispose: () => Promise.reject(new Error('file is locked')),
    });

    expect((await upscale.execute(input())).revision).toBe(2);
  });

  it('leaves a copy that prints sharp on every listed size as it is', async () => {
    await upscale.execute(input());

    const again = await upscale.execute(input());

    expect(again.revision).toBe(2);
    expect(upscaler.requests).toHaveLength(1);
  });

  it('makes the copy again from the imported artwork when a size listed since needs more', async () => {
    await upscale.execute(input());
    const larger = { placement: 'default', width: 12_000, height: 4000, dpi: 150 };

    const again = await upscale.execute(input({ model: 'photo', printTargets: on(AREA, larger) }));

    expect(upscaler.requests.map((request) => request.image.absolutePath)).toEqual([
      '/data/assets/sha-01-blanket',
      '/data/assets/sha-01-blanket',
    ]);
    expect(scaler.requests[1]?.size).toEqual({ width: 12_000, height: 5150 });
    expect(again).toMatchObject({
      revision: 3,
      upscale: { model: 'photo', originalSha256: 'sha-01-blanket' },
    });
  });

  it('refuses before the engine runs when four times larger still is not enough', async () => {
    const huge = { placement: 'default', width: 40_000, height: 20_000, dpi: 150 };

    await expect(upscale.execute(input({ printTargets: on(huge) }))).rejects.toMatchObject({
      code: 'ARTWORK_TOO_SMALL_EVEN_UPSCALED',
      details: { width: 15_360, height: 6592 },
    });
    expect(upscaler.requests).toHaveLength(0);
    expect(scaler.requests).toHaveLength(0);
  });

  it('leaves artwork that prints sharp already as it is', async () => {
    const small = { placement: 'default', width: 100, height: 50, dpi: 150 };

    const design = await upscale.execute(input({ printTargets: on(small) }));

    expect(design.revision).toBe(1);
    expect(upscaler.requests).toHaveLength(0);
  });

  it('cannot make the copy again once the imported artwork is gone', async () => {
    await catalog.designs.save(
      sampleDesign('01-blanket', {
        revision: 2,
        asset: {
          ...sampleDesign('01-blanket').asset,
          sha256: 'sha-big',
          width: 9000,
          height: 3863,
        },
        upscale: { model: 'photo', originalSha256: 'sha-elsewhere' },
      }),
    );
    const larger = { placement: 'default', width: 12_000, height: 4000, dpi: 150 };

    await expect(upscale.execute(input({ printTargets: on(larger) }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(upscaler.requests).toEqual([]);
  });

  it('refuses artwork too large to make four times larger', async () => {
    await catalog.designs.save(
      sampleDesign('01-blanket', {
        revision: 2,
        asset: { ...sampleDesign('01-blanket').asset, width: 8000, height: 8000 },
      }),
    );

    await expect(upscale.execute(input())).rejects.toBeInstanceOf(ValidationError);
    await expect(upscale.execute(input())).rejects.toMatchObject({
      details: { field: 'artwork', reason: '8000 × 8000 is too large to make larger' },
    });
    expect(upscaler.requests).toEqual([]);
  });

  it('refuses what the engine wrote unless it is four times larger, and stores nothing', async () => {
    upscaler.output = { mimeType: 'image/png', width: 3840 * 2, height: 1648 * 2 };

    await expect(upscale.execute(input())).rejects.toMatchObject({
      code: 'UPSCALE_FAILED',
      details: { reason: 'wrote 7680 × 3296 pixels, not 15360 × 6592' },
    });
    upscaler.output = null;
    await expect(upscale.execute(input())).rejects.toMatchObject({
      details: { reason: 'no image was written' },
    });
    expect(scaler.requests).toEqual([]);
    expect(assets.stored).toEqual([]);
    expect(() => folder.contentAt('/data/upscaled/1.png')).toThrow('ENOENT');
  });

  it('refuses a print file larger than the app can send, and stores nothing', async () => {
    scaler.byteSize = MAX_PRINT_FILE_BYTES + 1;

    await expect(upscale.execute(input())).rejects.toMatchObject({
      code: 'PRINT_FILE_TOO_LARGE',
      details: { megabytes: 101, maxMegabytes: 100 },
    });
    expect(assets.stored).toEqual([]);
    expect(() => folder.contentAt('/data/scaled/1.png')).toThrow('ENOENT');
    expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(1);
  });

  it('passes the upscaler failure on and changes nothing', async () => {
    upscaler.failWith = new Error('GPU lost');

    await expect(upscale.execute(input())).rejects.toThrow('GPU lost');
    expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(1);
  });

  it('fails for a design that does not exist', async () => {
    await expect(upscale.execute(input({ designId: 'nope' }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('makes turned artwork larger unturned, then turns the copy the same way', async () => {
    await catalog.designs.save(turnedRevision());

    const design = await upscale.execute(input({ printTargets: on(TALL) }));

    expect(upscaler.requests[0]?.image.absolutePath).toBe('/data/assets/sha-01-blanket');
    expect(rotator.requests).toEqual([
      { source: '/data/scaled/1.png', turn: 90, signal: undefined },
    ]);
    expect(design).toMatchObject({ revision: 4, rotation: TURN });
    expect(design.asset).toMatchObject({ width: 3863, height: 9000 });
    expect(design.upscale).toEqual({ model: 'illustration', originalSha256: 'sha-01-blanket' });
    const revisions = (await catalog.getDesign(BLANKET))?.revisions ?? [];
    expect(revisions[1]).toMatchObject({ revision: 3, rotation: undefined });
    expect(revisions[1]?.asset).toMatchObject({ width: 9000, height: 3863 });
    expect(() => folder.contentAt('/data/turned/1.png')).toThrow('ENOENT');
  });

  it('stores neither copy when the turned one is larger than the app can send', async () => {
    await catalog.designs.save(turnedRevision());
    rotator.byteSize = MAX_PRINT_FILE_BYTES + 1;

    await expect(upscale.execute(input({ printTargets: on(TALL) }))).rejects.toMatchObject({
      code: 'PRINT_FILE_TOO_LARGE',
    });
    expect(assets.stored).toEqual([]);
    expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(2);
  });

  it('keeps neither revision when saving the turned one fails', async () => {
    await catalog.designs.save(turnedRevision());
    const failing = deps({
      unitOfWork: {
        run: (work) =>
          catalog.run((tx) =>
            work({
              ...tx,
              designs: {
                ...tx.designs,
                save: (design) =>
                  design.rotation
                    ? Promise.reject(new Error('disk full'))
                    : tx.designs.save(design),
              },
            }),
          ),
      },
    });

    await expect(
      new UpscaleDesign(failing).execute(input({ printTargets: on(TALL) })),
    ).rejects.toThrow('disk full');
    expect((await catalog.getDesign(BLANKET))?.design.revision).toBe(2);
  });

  describe('where the provider prints the artwork upright on the area turned', () => {
    const blanket: PrintProduct = {
      familyId: sampleDesign('01-blanket').familyId,
      productId: '395',
      name: 'Blanket',
      variants: [{ id: '1', name: 'Blanket 50x60', color: null, size: '50x60', areas: [TALL] }],
    };
    const orientation = { supportsOrientation: () => Promise.resolve(true) };
    const checkFor = () =>
      new CheckDesignPrint(catalog, new FakePrintCatalog([blanket]), orientation);

    beforeEach(() => {
      upscale = new UpscaleDesign(deps({ orientation }));
    });

    it('makes turned artwork sharp as the check judges it and as the provider prints it', async () => {
      await catalog.designs.save(turnedRevision());
      expect((await checkFor().execute({ designId: BLANKET, fit: 'cover' })).check.quality).toBe(
        'poor',
      );

      await upscale.execute(input({ printTargets: on(TALL) }));

      const checked = await checkFor().execute({ designId: BLANKET, fit: 'cover' });
      expect(checked.check.quality).toBe('good');
      expect(checked.upright?.source).toMatchObject({ revision: 3, rotation: undefined });
      expect(checked.design).toMatchObject({ revision: 4, rotation: TURN });
      const again = await upscale.execute(input({ printTargets: on(TALL) }));
      expect(again.revision).toBe(4);
      expect(upscaler.requests).toHaveLength(1);
    });

    it('makes larger again a turned copy made larger before the turn was kept apart', async () => {
      await catalog.designs.save(turnedRevision());
      await catalog.designs.save(
        turnedRevision({
          revision: 3,
          asset: { ...turnedRevision().asset, sha256: 'sha-big', width: 3863, height: 9000 },
          upscale: { model: 'illustration', originalSha256: 'sha-01-blanket' },
        }),
      );

      const design = await upscale.execute(input({ printTargets: on(TALL) }));

      expect(design).toMatchObject({ revision: 5, rotation: TURN });
      const checked = await checkFor().execute({ designId: BLANKET, fit: 'cover' });
      expect(checked.check.quality).toBe('good');
      expect(checked.upright?.source.revision).toBe(4);
    });

    it('sizes unturned artwork for the turned area it is printed on, also when contained', async () => {
      const contained = (await checkFor().execute({ designId: BLANKET, fit: 'contain' })).check;
      expect(contained.quality).toBe('poor');

      const design = await upscale.execute(input({ printTargets: on(TALL), fit: 'contain' }));

      expect(design).toMatchObject({ revision: 2, rotation: undefined });
      expect(rotator.requests).toEqual([]);
      const checked = await checkFor().execute({ designId: BLANKET, fit: 'contain' });
      expect(checked.check.quality).toBe('good');
      expect(checked.upright?.source.revision).toBe(2);
    });
  });
});
