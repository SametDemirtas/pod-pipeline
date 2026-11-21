import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError, PinOutcomeUnknownError, ValidationError } from '../errors.js';
import {
  sampleConcept,
  sampleDesign,
  sampleListing,
  samplePin,
} from '../testing/contract/index.js';
import {
  FakePinPublisher,
  InMemoryCatalog,
  InMemoryListings,
  InMemoryMockups,
  InMemoryPins,
  SAMPLE_LINKS,
} from '../testing/index.js';
import type { Mockup, MockupId } from '../mockups/mockup.js';
import { ApprovePin } from './approve-pin.js';
import { PIN_OUTCOME_UNKNOWN } from '../errors.js';
import type { Pin, PinId } from './pin.js';
import { PublishPins } from './publish-pins.js';

const MUG = 'design-01-mug' as DesignId;

/** The photo the sample pins were made from. */
const photo = (changes: Partial<Mockup> = {}): Mockup => ({
  id: 'm1' as MockupId,
  designId: MUG,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: 'Front',
  scenePrompt: null,
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: 'm1',
    storageKey: 'ab/m1',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 1,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
  ...changes,
});

describe('PublishPins', () => {
  let pins: InMemoryPins;
  let pinterest: FakePinPublisher;
  let listings: InMemoryListings;
  let catalog: InMemoryCatalog;
  let mockups: InMemoryMockups;
  let publish: PublishPins;
  const outage = new Error('signed out');
  const dropped = new Error('connection lost');

  beforeEach(async () => {
    pins = new InMemoryPins();
    pinterest = new FakePinPublisher();
    listings = new InMemoryListings();
    catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    mockups = new InMemoryMockups();
    await mockups.add([photo()]);
    publish = new PublishPins({
      pins,
      query: catalog,
      mockups,
      publisher: pinterest,
      listings,
      links: SAMPLE_LINKS,
      assets: { pathOf: (key) => `/data/${key}` },
      clock: { now: () => new Date(Date.UTC(2026, 10, 1, 9, 30)) },
      isOutage: (error) => error === outage,
      isOutcomeUnknown: (error) => error === dropped,
    });
  });

  it('publishes the pins whose time has come, with the image and the disclosure', async () => {
    await pins.save(
      samplePin('due', MUG, 0, { aiModified: true, link: 'https://www.etsy.com/listing/1' }),
    );
    await pins.save(samplePin('later', MUG, 45));

    const done = await publish.publishDue();

    expect(done.map((pin) => [pin.id, pin.state, pin.publishedId])).toEqual([
      ['due', 'published', 'pin-1'],
    ]);
    expect(pinterest.published).toEqual([
      {
        boardId: '5001',
        title: 'Tulip mug',
        description: 'Cosy.',
        altText: 'A mug on a table',
        link: 'https://www.etsy.com/listing/1',
        image: { absolutePath: '/data/pins/due', mimeType: 'image/png' },
        aiModified: true,
      },
    ]);
  });

  it('records a failure on the pin and goes on with the others', async () => {
    await pins.save(samplePin('a', MUG, 0));
    await pins.save(samplePin('b', MUG, 1));
    pinterest.failWith = new Error('board not found');

    const done = await publish.publishDue();

    expect(done.map((pin) => [pin.state, pin.failure])).toEqual([
      ['failed', 'board not found'],
      ['failed', 'board not found'],
    ]);
    expect(await publish.publishDue()).toEqual([]);
  });

  it('publishes a failed pin again on request, and a published one only once', async () => {
    await pins.save(samplePin('p1', MUG, 50, { state: 'failed', failure: 'x' }));

    const published = await publish.publishNow('p1');
    const again = await publish.publishNow('p1');

    expect(published).toMatchObject({ state: 'published', failure: null });
    expect(again).toEqual(published);
    expect(pinterest.published).toHaveLength(1);
  });

  it('publishes a proposed pin only after it was approved', async () => {
    await pins.save(samplePin('p1', MUG, 0, { state: 'proposed' }));

    await expect(publish.publishNow('p1')).rejects.toBeInstanceOf(ValidationError);
    expect(await publish.publishDue()).toEqual([]);
    await new ApprovePin(pins).execute('p1');
    expect((await publish.publishDue()).map((pin) => pin.state)).toEqual(['published']);
  });

  it('needs the pin', async () => {
    await expect(publish.publishNow('gone')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('links to the listing once it went live after the pin was planned', async () => {
    await pins.save(samplePin('due', MUG, 0));
    await listings.save(sampleListing(MUG, { state: 'active' }));

    const [done] = await publish.publishDue();

    expect(done?.link).toBe('https://shop.example/listing/1234567890');
    expect(pinterest.published[0]?.link).toBe('https://shop.example/listing/1234567890');
  });

  it('records publishing before asking Pinterest, and keeps the error code', async () => {
    await pins.save(samplePin('p1', MUG, 0));
    let seen: Pin | undefined;
    pinterest.publish = async () => {
      seen = await pins.get('p1' as PinId);
      throw Object.assign(new Error('Invalid board'), { code: 'PROVIDER_FAILED' });
    };

    const [failed] = await publish.publishDue();

    expect(seen?.state).toBe('publishing');
    expect(failed).toMatchObject({ state: 'failed', failureCode: 'PROVIDER_FAILED' });
  });

  it('marks a pin whose request broke off as of unknown outcome and stops the batch', async () => {
    await pins.save(samplePin('p1', MUG, 0));
    await pins.save(samplePin('p2', MUG, 1));
    pinterest.failWith = dropped;

    const done = await publish.publishDue();

    expect(done).toMatchObject([
      { id: 'p1', state: 'failed', failure: 'connection lost', failureCode: PIN_OUTCOME_UNKNOWN },
    ]);
    expect((await pins.get('p2' as PinId))?.state).toBe('planned');
  });

  it('publishes a pin of unknown outcome again only once the seller confirmed it', async () => {
    await pins.save(
      samplePin('p1', MUG, 0, { state: 'failed', failureCode: PIN_OUTCOME_UNKNOWN, failure: 'x' }),
    );

    await expect(publish.publishNow('p1')).rejects.toBeInstanceOf(PinOutcomeUnknownError);
    expect(pinterest.published).toEqual([]);
    expect((await publish.publishNow('p1', true)).state).toBe('published');
  });

  it('never records a pin Pinterest made as failed when saving it fails', async () => {
    await pins.save(samplePin('p1', MUG, 0));
    const save = pins.save.bind(pins);
    pins.save = async (pin) => {
      if (pin.state === 'published') throw new Error('disk full');
      return save(pin);
    };

    await expect(publish.publishNow('p1')).rejects.toThrow('disk full');
    expect((await pins.get('p1' as PinId))?.state).toBe('publishing');
    expect((await publish.recoverInterrupted())[0]?.failureCode).toBe(PIN_OUTCOME_UNKNOWN);
  });

  it('skips a pin removed or published elsewhere while the batch ran', async () => {
    await pins.save(samplePin('a', MUG, 0));
    await pins.save(samplePin('b', MUG, 1));
    await pins.save(samplePin('c', MUG, 2));
    const publishOne = pinterest.publish.bind(pinterest);
    pinterest.publish = async (pin) => {
      await pins.remove('b' as PinId);
      await pins.save(samplePin('c', MUG, 2, { state: 'published', publishedId: '7' }));
      return publishOne(pin);
    };

    const done = await publish.publishDue();

    expect(done.map((pin) => pin.id)).toEqual(['a']);
    expect(await pins.get('b' as PinId)).toBeUndefined();
    expect(pinterest.published).toHaveLength(1);
  });

  it('stops between two pins when asked to', async () => {
    await pins.save(samplePin('a', MUG, 0));
    await pins.save(samplePin('b', MUG, 1));
    let stop = false;
    const publishOne = pinterest.publish.bind(pinterest);
    pinterest.publish = (pin) => {
      stop = true;
      return publishOne(pin);
    };

    expect((await publish.publishDue(() => stop)).map((pin) => pin.id)).toEqual(['a']);
    expect((await pins.get('b' as PinId))?.state).toBe('planned');
  });

  it('stops at an outage and leaves the pins as they were', async () => {
    await pins.save(samplePin('a', MUG, 0));
    await pins.save(samplePin('b', MUG, 1));
    await pins.save(samplePin('f', MUG, 2, { state: 'failed', failure: 'x' }));
    pinterest.failWith = outage;

    await expect(publish.publishDue()).rejects.toBe(outage);
    expect((await pins.listDue(new Date(Date.UTC(2026, 10, 1, 9, 30)))).map((p) => p.id)).toEqual([
      'a',
      'b',
    ]);
    await expect(publish.publishNow('f')).rejects.toBe(outage);
    expect((await pins.get('f' as PinId))?.state).toBe('failed');
  });

  it('reports the outage though the pin could not be put back, and the failed save apart', async () => {
    const saveErrors: unknown[] = [];
    const reporting = new PublishPins({
      pins,
      query: catalog,
      mockups,
      publisher: pinterest,
      listings,
      links: SAMPLE_LINKS,
      assets: { pathOf: (key) => `/data/${key}` },
      clock: { now: () => new Date(Date.UTC(2026, 10, 1, 9, 30)) },
      isOutage: (error) => error === outage,
      onSaveError: (error) => saveErrors.push(error),
    });
    await pins.save(samplePin('a', MUG, 0));
    pinterest.failWith = outage;
    const save = pins.save.bind(pins);
    pins.save = (pin) =>
      pin.state === 'planned' ? Promise.reject(new Error('disk full')) : save(pin);

    await expect(reporting.publishNow('a')).rejects.toBe(outage);
    expect(saveErrors).toEqual([new Error('disk full')]);
  });

  it('marks pins interrupted while publishing as failed, never sending them again', async () => {
    await pins.save(samplePin('a', MUG, 0, { state: 'publishing' }));
    await pins.save(samplePin('b', MUG, 1));

    const recovered = await publish.recoverInterrupted();

    expect(recovered).toMatchObject([
      { id: 'a', state: 'failed', failureCode: PIN_OUTCOME_UNKNOWN },
    ]);
    expect(await publish.publishNow('b')).toMatchObject({ state: 'published' });
    expect(pinterest.published.map((pin) => pin.title)).toHaveLength(1);
  });

  it('leaves a pin being published alone when asked to publish it now', async () => {
    await pins.save(samplePin('p1', MUG, 0, { state: 'publishing' }));

    expect((await publish.publishNow('p1')).state).toBe('publishing');
    expect(pinterest.published).toEqual([]);
  });

  describe('fails a pin whose photo may no longer be published, sending nothing', () => {
    const outdated = async () => {
      await pins.save(samplePin('a', MUG, 0));
      const [failed] = await publish.publishDue();
      expect(failed).toMatchObject({ state: 'failed', failureCode: 'PIN_PHOTO_OUTDATED' });
      expect(pinterest.published).toEqual([]);
      return failed;
    };

    it('once the photo is gone', async () => {
      await mockups.remove(MUG, 'm1' as MockupId);

      expect((await outdated())?.failure).toContain('Mockup');
    });

    it('once a newer revision of the artwork was imported', async () => {
      await catalog.designs.save(sampleDesign('01-mug', { revision: 2 }));

      expect((await outdated())?.failure).toContain('earlier version');
    });

    it('once the confirmation of a scene was taken back', async () => {
      await mockups.remove(MUG, 'm1' as MockupId);
      await mockups.add([photo({ scenePrompt: 'On a table', printConfirmed: false })]);

      expect((await outdated())?.failure).toContain('confirm the print');
    });

    it('once the design is gone, also when asked to publish now', async () => {
      await pins.save(samplePin('b', 'design-gone' as DesignId, 0, { state: 'failed' }));

      expect(await publish.publishNow('b')).toMatchObject({
        state: 'failed',
        failureCode: 'PIN_PHOTO_OUTDATED',
      });
    });
  });
});
