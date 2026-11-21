import { describe, expect, it, vi } from 'vitest';
import { GetDesign, RotateDesign } from '@pod/core';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import {
  FakeImagePreviews,
  FakeImageRotator,
  FakeRotationAdvisor,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  RecordingAssetStore,
} from '@pod/core/testing';
import { printCheckDto } from '../../testing/batch-fixtures.js';
import { settingsDto } from '../../testing/fake-catalog.js';
import { RotateInProgressError } from '../errors/print-errors.js';
import { AppClosingError } from '../../shared/app-error.js';
import { WorkStoppedError } from '../errors/work-stopped.js';
import { RotationService } from './rotation-service.js';

const BLANKET = 'design-01-blanket';

async function setUp() {
  const folder = new FakeSourceFolder('/data');
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01'));
  const portrait = sampleDesign('01-blanket');
  await catalog.designs.save({
    ...portrait,
    asset: { ...portrait.asset, width: 2560, height: 3200 },
  });
  folder.write({
    relativePath: portrait.asset.storageKey,
    content: 'artwork',
    image: { mimeType: 'image/png', width: 2560, height: 3200 },
  });
  const advisor = new FakeRotationAdvisor();
  const rotator = new FakeImageRotator(folder);
  const events = { catalogChanged: vi.fn() };
  const settings = {
    get: () => Promise.resolve(settingsDto({ listingSizes: { blanket: ['50″×60″'] } })),
  };
  const area = (width: number, height: number) => [
    { placement: 'default', width, height, dpi: 150 },
  ];
  const checkPrint = vi.fn(() =>
    Promise.resolve(
      printCheckDto({
        designId: BLANKET,
        fit: 'cover',
        variants: [
          { id: '10986', name: '50″×60″', color: null, size: '50″×60″', areas: area(9450, 7950) },
          { id: '13222', name: '60″×80″', color: null, size: '60″×80″', areas: area(9000, 12000) },
        ],
        variantId: '10986',
      }),
    ),
  );
  const service = new RotationService({
    rotate: new RotateDesign({
      query: catalog,
      designs: catalog.designs,
      previews: new FakeImagePreviews(),
      advisor,
      rotator,
      assets: Object.assign(new RecordingAssetStore(folder), {
        pathOf: (key: string) => `/data/${key}`,
      }),
      clock: new FixedClock(),
    }),
    getDesign: new GetDesign(catalog),
    catalog: { checkPrint },
    settings,
    events,
  });
  return { service, catalog, advisor, rotator, events, checkPrint };
}

describe('RotationService', () => {
  it('turns the artwork to fit the areas of the sizes the listing sells', async () => {
    const { service, rotator, events, checkPrint } = await setUp();

    const result = await service.rotateDesign({ id: BLANKET });

    expect(result).toMatchObject({
      status: 'rotated',
      reason: 'The figure stands upright on the hung blanket.',
      design: { revision: 2, rotation: 90, asset: { width: 3200, height: 2560 } },
    });
    expect(result.design.revisions.map((revision) => revision.rotation)).toEqual([90, null]);
    expect(rotator.requests).toHaveLength(1);
    expect(checkPrint).toHaveBeenCalledWith({ designId: BLANKET, fit: 'cover' });
    expect(events.catalogChanged).toHaveBeenCalledOnce();
  });

  it('passes on why the artwork stays as it is and keeps that with the design', async () => {
    const { service, advisor, events } = await setUp();
    advisor.advice = { degrees: 0, reason: 'A pattern with no top.' };

    const result = await service.rotateDesign({ id: BLANKET });

    expect(result).toMatchObject({ status: 'kept', reason: 'A pattern with no top.' });
    expect(result.design).toMatchObject({
      revision: 1,
      keptOrientationReason: 'A pattern with no top.',
    });
    expect(events.catalogChanged).toHaveBeenCalledOnce();

    const again = await service.rotateDesign({ id: BLANKET });
    expect(again).toMatchObject({ status: 'kept', reason: 'A pattern with no top.' });
    expect(advisor.questions).toHaveLength(1);
    expect(events.catalogChanged).toHaveBeenCalledOnce();
  });

  it('leaves the artwork of a product that is not turned without checking its print', async () => {
    const { service, catalog, events, checkPrint } = await setUp();
    await catalog.designs.save(sampleDesign('01-mug'));

    const result = await service.rotateDesign({ id: 'design-01-mug' });

    expect(result).toMatchObject({ status: 'unneeded', reason: null });
    expect(checkPrint).not.toHaveBeenCalled();
    expect(events.catalogChanged).not.toHaveBeenCalled();
  });

  it('turns one artwork once at a time', async () => {
    const { service } = await setUp();

    const first = service.rotateDesign({ id: BLANKET });
    await expect(service.rotateDesign({ id: BLANKET })).rejects.toBeInstanceOf(
      RotateInProgressError,
    );
    expect((await first).status).toBe('rotated');
    expect((await service.rotateDesign({ id: BLANKET })).status).toBe('unneeded');
  });

  it('stops turning as the app closes', async () => {
    const { service, rotator } = await setUp();
    const rotate = vi.spyOn(rotator, 'rotate').mockImplementation(
      (_source, _turn, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('stopped'));
          });
        }),
    );

    const running = service.rotateDesign({ id: BLANKET });
    void running.catch(() => undefined);
    await vi.waitFor(() => {
      expect(rotate).toHaveBeenCalled();
    });
    await service.close();

    await expect(running).rejects.toBeInstanceOf(AppClosingError);
  });

  it('ends as stopped work when the turn is stopped, whatever error the turning ends with', async () => {
    const { service, rotator } = await setUp();
    const controller = new AbortController();
    const rotate = vi.spyOn(rotator, 'rotate').mockImplementation(
      (_source, _turn, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('worker ended'));
          });
        }),
    );

    const running = service.rotateDesign({ id: BLANKET }, controller.signal);
    void running.catch(() => undefined);
    await vi.waitFor(() => {
      expect(rotate).toHaveBeenCalled();
    });
    controller.abort();

    await expect(running).rejects.toBeInstanceOf(WorkStoppedError);
  });
});
