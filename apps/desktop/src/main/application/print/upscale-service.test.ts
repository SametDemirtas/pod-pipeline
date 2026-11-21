import { describe, expect, it, vi } from 'vitest';
import { GetDesign, UpscaleDesign, type UpscaleRequest } from '@pod/core';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import { printCheckDto } from '../../testing/batch-fixtures.js';
import { settingsDto } from '../../testing/fake-catalog.js';
import {
  FakeImageRotator,
  FakeImageScaler,
  FakeSourceFolder,
  FakeUpscaler,
  FixedClock,
  InMemoryCatalog,
  RecordingAssetStore,
} from '@pod/core/testing';
import { UpscaleInProgressError, UpscalerUnavailableError } from '../errors/print-errors.js';
import { AppClosingError } from '../../shared/app-error.js';
import { WorkStoppedError } from '../errors/work-stopped.js';
import { UpscaleService, type UpscaleEvents } from './upscale-service.js';

const BLANKET = 'design-01-blanket';

async function setUp(options: { installed?: boolean } = {}) {
  const folder = new FakeSourceFolder('/data');
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01'));
  await catalog.designs.save(sampleDesign('01-blanket'));
  const upscaler = new FakeUpscaler(folder);
  const events = {
    catalogChanged: vi.fn(),
    upscaleProgress: vi.fn<UpscaleEvents['upscaleProgress']>(),
  };
  const scaler = new FakeImageScaler(folder);
  const settings = {
    get: () =>
      Promise.resolve(
        settingsDto({ upscaleModel: 'photo', listingSizes: { blanket: ['60″×80″'] } }),
      ),
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
          { id: '10986', name: '50″×60″', color: null, size: '50″×60″', areas: area(7500, 2000) },
          { id: '13222', name: '60″×80″', color: null, size: '60″×80″', areas: area(9000, 3000) },
        ],
        variantId: '10986',
      }),
    ),
  );
  const service = new UpscaleService({
    upscale:
      options.installed === false
        ? null
        : new UpscaleDesign({
            query: catalog,
            unitOfWork: catalog,
            upscaler,
            scaler,
            rotator: new FakeImageRotator(folder),
            assets: Object.assign(new RecordingAssetStore(folder), {
              pathOf: (key: string) => `/data/${key}`,
            }),
            inspector: folder,
            clock: new FixedClock(),
          }),
    getDesign: new GetDesign(catalog),
    catalog: { checkPrint },
    settings,
    events,
  });
  return { service, upscaler, scaler, checkPrint, events };
}

describe('UpscaleService', () => {
  it('makes the artwork larger with the model the settings choose, as the listed sizes need', async () => {
    const { service, upscaler, scaler, checkPrint, events } = await setUp();

    const design = await service.upscaleDesign({ id: BLANKET });

    expect(design.revision).toBe(2);
    expect(design.upscaleModel).toBe('photo');
    expect(design.revisions.map((revision) => revision.upscaleModel)).toEqual(['photo', null]);
    expect(upscaler.requests[0]?.model).toBe('photo');
    expect(checkPrint).toHaveBeenCalledWith({ designId: BLANKET, fit: 'cover' });
    expect(upscaler.requests).toHaveLength(1);
    expect(scaler.requests[0]?.size).toEqual({ width: 9000, height: 3863 });
    expect(events.catalogChanged).toHaveBeenCalledOnce();
  });

  it('tells the window of each whole percent once', async () => {
    const { service, upscaler, events } = await setUp();
    const upscale = upscaler.upscale.bind(upscaler);
    vi.spyOn(upscaler, 'upscale').mockImplementation((request: UpscaleRequest) => {
      for (const share of [0, 0.004, 0.25, 0.251, 1]) request.onProgress?.(share);
      return upscale({ ...request, onProgress: undefined });
    });

    await service.upscaleDesign({ id: BLANKET });

    expect(events.upscaleProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { designId: BLANKET, share: 0 },
      { designId: BLANKET, share: 0.25 },
      { designId: BLANKET, share: 1 },
    ]);
  });

  it('says so when the engine is not installed', async () => {
    const { service } = await setUp({ installed: false });

    await expect(service.upscaleDesign({ id: BLANKET })).rejects.toBeInstanceOf(
      UpscalerUnavailableError,
    );
  });

  it('makes one artwork larger at a time', async () => {
    const { service } = await setUp();

    const first = service.upscaleDesign({ id: BLANKET });
    await expect(service.upscaleDesign({ id: BLANKET })).rejects.toBeInstanceOf(
      UpscaleInProgressError,
    );
    await first;
  });

  it('stops the engine when asked to, as stopped work', async () => {
    const { service, upscaler } = await setUp();
    const controller = new AbortController();
    let signal: UpscaleRequest['signal'];
    vi.spyOn(upscaler, 'upscale').mockImplementation((request: UpscaleRequest) => {
      signal = request.signal;
      return new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new Error('stopped'));
        });
      });
    });

    const running = service.upscaleDesign({ id: BLANKET }, controller.signal);
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    controller.abort();

    expect(signal?.aborted).toBe(true);
    await expect(running).rejects.toBeInstanceOf(WorkStoppedError);
  });

  it('stops the engine as the app closes, and closes only once the engine is gone', async () => {
    const { service, upscaler } = await setUp();
    let signal: UpscaleRequest['signal'];
    let exited: () => void = () => undefined;
    vi.spyOn(upscaler, 'upscale').mockImplementation((request: UpscaleRequest) => {
      signal = request.signal;
      return new Promise((_resolve, reject) => {
        exited = () => {
          reject(new Error('stopped'));
        };
      });
    });
    const closed = vi.fn();

    const running = service.upscaleDesign({ id: BLANKET });
    void running.catch(() => undefined);
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    const closing = service.close().then(closed);
    await new Promise((resolve) => setImmediate(resolve));

    expect(signal?.aborted).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    exited();
    await closing;
    expect(closed).toHaveBeenCalled();
    await expect(running).rejects.toBeInstanceOf(AppClosingError);
  });

  it('ends as stopped work when the larger copy is stopped while it is scaled', async () => {
    const { service, scaler } = await setUp();
    const controller = new AbortController();
    const scale = vi.spyOn(scaler, 'scale').mockImplementation(
      (_source, _size, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('worker ended'));
          });
        }),
    );

    const running = service.upscaleDesign({ id: BLANKET }, controller.signal);
    void running.catch(() => undefined);
    await vi.waitFor(() => {
      expect(scale).toHaveBeenCalled();
    });
    controller.abort();

    await expect(running).rejects.toBeInstanceOf(WorkStoppedError);
  });
});
