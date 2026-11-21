import { describe, expect, it, vi } from 'vitest';
import { ApprovePin, PlanPin, PublishPins, RemovePin, type DesignId } from '@pod/core';
import {
  FakePinComposer,
  FakePinPublisher,
  FakeSourceFolder,
  FixedClock,
  InMemoryCatalog,
  InMemoryListings,
  InMemoryMockups,
  InMemoryPins,
  RecordingAssetStore,
  SAMPLE_LINKS,
  SequentialIds,
} from '@pod/core/testing';
import { sampleConcept, sampleDesign } from '@pod/core/testing/contract';
import { photo } from '../../testing/mockup-fixtures.js';
import { PinService } from './pin-service.js';

const MUG = 'design-01-mug' as DesignId;

class OfflineError extends Error {}

const request = {
  designId: MUG,
  mockupId: 'm1',
  title: 'Tulip mug',
  description: 'Cosy.',
  altText: 'A white mug',
  headline: 'Spooky',
  boardId: '5001',
  publishAt: '2026-01-01T00:00:00.000Z',
};

async function setUp(connected = true) {
  const catalog = new InMemoryCatalog();
  await catalog.concepts.save(sampleConcept('01'));
  await catalog.designs.save(sampleDesign('01-mug'));
  const mockups = new InMemoryMockups();
  await mockups.add([photo]);
  const folder = new FakeSourceFolder('/data');
  const assets = Object.assign(new RecordingAssetStore(folder), {
    pathOf: (key: string) => `/data/${key}`,
  });
  const pins = new InMemoryPins();
  const composer = new FakePinComposer(folder);
  const pinterest = new FakePinPublisher();
  const clock = new FixedClock();
  const catalogChanged = vi.fn<() => void>();
  const service = new PinService({
    plan: new PlanPin({
      query: catalog,
      mockups,
      listings: new InMemoryListings(),
      links: SAMPLE_LINKS,
      composer,
      inspector: folder,
      assets,
      pins,
      clock,
      ids: new SequentialIds('pin'),
    }),
    publish: new PublishPins({
      pins,
      query: catalog,
      mockups,
      publisher: pinterest,
      listings: new InMemoryListings(),
      links: SAMPLE_LINKS,
      assets,
      clock,
      isOutage: (error) => error instanceof OfflineError,
    }),
    approve: new ApprovePin(pins),
    remove: new RemovePin(pins),
    pins,
    publisher: pinterest,
    links: { pinUrl: (pinId) => `https://pins.example/${pinId}` },
    connected: () => Promise.resolve(connected),
    events: { catalogChanged },
  });
  return { service, pinterest, pins, composer, catalogChanged };
}

describe('PinService', () => {
  it('plans a pin from the window and publishes it when due', async () => {
    const { service, pinterest } = await setUp();

    const pin = await service.planPin(request);
    const done = await service.publishDue();

    expect(pin).toMatchObject({
      id: 'pin-0001',
      state: 'planned',
      title: 'Tulip mug',
      headline: 'Spooky',
      publishAt: '2026-01-01T00:00:00.000Z',
      image: { width: 1000, height: 1500 },
      publishedUrl: null,
    });
    expect(done).toMatchObject([
      { id: 'pin-0001', state: 'published', publishedUrl: 'https://pins.example/pin-1' },
    ]);
    expect(pinterest.published).toHaveLength(1);
  });

  it('keeps an assistant’s pin waiting until the seller approves it', async () => {
    const { service, pinterest, catalogChanged } = await setUp();

    const proposed = await service.proposePin(request);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
    expect(await service.publishDue()).toEqual([]);
    const approved = await service.approvePin({ id: proposed.id });
    const published = await service.publishPinNow({ id: proposed.id });

    expect([proposed.state, approved.state, published.state]).toEqual([
      'proposed',
      'planned',
      'published',
    ]);
    expect(pinterest.published).toHaveLength(1);
  });

  it('tells the windows about pins sent before an outage stopped the batch', async () => {
    const { service, pinterest, catalogChanged } = await setUp();
    await service.planPin(request);
    await service.planPin(request);
    const publishOne = pinterest.publish.bind(pinterest);
    pinterest.publish = (pin) => {
      pinterest.publish = () => Promise.reject(new OfflineError('offline'));
      return publishOne(pin);
    };

    await expect(service.publishDue()).rejects.toThrow('offline');
    expect(pinterest.published).toHaveLength(1);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing while Pinterest is not connected', async () => {
    const { service, pinterest } = await setUp(false);
    await service.planPin(request);

    expect(await service.publishDue()).toEqual([]);
    expect(pinterest.published).toEqual([]);
  });

  it('lists a design’s pins and removes one', async () => {
    const { service } = await setUp();
    const first = await service.planPin(request);
    await service.planPin({ ...request, publishAt: '2026-01-02T00:00:00.000Z' });

    expect((await service.listPins({ id: MUG })).map((pin) => pin.id)).toEqual([
      'pin-0001',
      'pin-0002',
    ]);
    expect((await service.removePin({ id: first.id })).map((pin) => pin.id)).toEqual(['pin-0002']);
    await expect(service.removePin({ id: 'gone' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('makes one pin at a time and lists the boards', async () => {
    const { service } = await setUp();

    const first = service.planPin(request);
    await expect(service.planPin(request)).rejects.toMatchObject({ code: 'PIN_IN_PROGRESS' });
    await first;
    expect(await service.listBoards()).toHaveLength(2);
  });

  it('runs publishing and removing one after another, and stops for closing', async () => {
    const { service, pinterest } = await setUp();
    const first = await service.planPin(request);
    const second = await service.planPin(request);
    let release: () => void = () => undefined;
    const publishOne = pinterest.publish.bind(pinterest);
    pinterest.publish = (pin) =>
      new Promise((resolve, reject) => {
        release = () => {
          publishOne(pin).then(resolve, reject);
        };
      });

    const due = service.publishDue();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const now = service.publishPinNow({ id: first.id });
    const removed = service.removePin({ id: second.id });
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();

    expect((await due).map((pin) => pin.id)).toEqual([first.id, second.id]);
    expect((await now).state).toBe('published');
    expect(await removed).toMatchObject([{ id: first.id, state: 'published' }]);
    expect(pinterest.published).toHaveLength(2);
    await service.close();
    await expect(service.publishDue()).rejects.toThrow('The app is closing');
  });

  it('waits for a pin being planned before closing, and plans none after', async () => {
    const { service, composer, pins } = await setUp();
    let finish: () => void = () => undefined;
    const compose = composer.compose.bind(composer);
    composer.compose = (input) =>
      new Promise((resolve, reject) => {
        finish = () => {
          compose(input).then(resolve, reject);
        };
      });
    const planning = service.planPin(request);
    await new Promise((resolve) => setTimeout(resolve, 0));

    let closed = false;
    const closing = service.close().then(() => (closed = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(false);
    finish();
    await closing;

    expect(await pins.listForDesign(MUG)).toEqual([
      expect.objectContaining({ id: (await planning).id }),
    ]);
    await expect(service.planPin(request)).rejects.toThrow('The app is closing');
  });

  it('sends a pin of unknown outcome again only when the request says the seller confirmed', async () => {
    const { service, pinterest, pins } = await setUp();
    const pin = await service.planPin(request);
    const stored = await pins.get(pin.id as never);
    if (stored) {
      await pins.save({ ...stored, state: 'failed', failureCode: 'PIN_OUTCOME_UNKNOWN' });
    }

    await expect(service.publishPinNow({ id: pin.id })).rejects.toMatchObject({
      code: 'PIN_OUTCOME_UNKNOWN',
    });
    expect(pinterest.published).toEqual([]);
    expect(await service.publishPinNow({ id: pin.id, confirmUnknown: true })).toMatchObject({
      state: 'published',
    });
  });

  it('marks a pin the app stopped publishing as failed without sending it', async () => {
    const { service, pinterest, pins } = await setUp();
    const pin = await service.planPin(request);
    const stored = await pins.get(pin.id as never);
    if (stored) await pins.save({ ...stored, state: 'publishing' });

    expect(await service.recoverInterrupted()).toMatchObject([
      { id: pin.id, state: 'failed', failureCode: 'PIN_OUTCOME_UNKNOWN' },
    ]);
    expect(await service.publishDue()).toEqual([]);
    expect(pinterest.published).toEqual([]);
  });
});
