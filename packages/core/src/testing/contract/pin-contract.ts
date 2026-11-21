import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import type { Pin, PinId } from '../../pins/pin.js';
import type { CatalogWriter } from '../../ports/catalog-repositories.js';
import type { PinRepository } from '../../ports/pins.js';
import type { MockupId } from '../../mockups/mockup.js';
import { sampleConcept, sampleDesign } from './samples.js';

export interface PinPersistence {
  readonly catalog: CatalogWriter;
  readonly pins: PinRepository;
}

const MUG = 'design-01-mug' as DesignId;
const BLANKET = 'design-01-blanket' as DesignId;

export function samplePin(
  id: string,
  designId: DesignId,
  minute: number,
  overrides: Partial<Pin> = {},
): Pin {
  return {
    id: id as PinId,
    designId,
    mockupId: 'm1' as MockupId,
    text: { title: 'Tulip mug', description: 'Cosy.', altText: 'A mug on a table' },
    headline: 'Spooky season',
    boardId: '5001',
    link: null,
    image: {
      sha256: `sha-${id}`,
      storageKey: `pins/${id}`,
      mimeType: 'image/png',
      width: 1000,
      height: 1500,
      byteSize: 100,
    },
    aiModified: false,
    publishAt: new Date(Date.UTC(2026, 10, 1, 9, minute)),
    state: 'planned',
    publishedId: null,
    failure: null,
    failureCode: null,
    createdAt: new Date('2026-10-26T10:00:00.000Z'),
    ...overrides,
  };
}

/** Behaviour every pin repository must share. */
export function describePinContract(
  name: string,
  create: () => Promise<PinPersistence> | PinPersistence,
): void {
  describe(`${name} pin contract`, () => {
    let current: PinPersistence;
    const store = () => current;

    beforeEach(async () => {
      current = await create();
      await current.catalog.concepts.save(sampleConcept('01'));
      await current.catalog.designs.save(sampleDesign('01-mug'));
      await current.catalog.designs.save(sampleDesign('01-blanket'));
    });

    describeStoredPins(store);
    describePinLists(store);
  });
}

/** Saving and removing pins. */
function describeStoredPins(store: () => PinPersistence): void {
  it('keeps every field of a pin and replaces it when saved again', async () => {
    const pin = samplePin('p1', MUG, 0, {
      link: 'https://www.etsy.com/listing/1',
      aiModified: true,
    });
    await store().pins.save(pin);
    const published = {
      ...pin,
      state: 'failed' as const,
      failure: 'Invalid board',
      failureCode: 'PROVIDER_FAILED',
    };
    await store().pins.save(published);

    expect(await store().pins.get('p1' as PinId)).toEqual(published);
    expect(await store().pins.get('gone' as PinId)).toBeUndefined();
  });

  it('keeps the order of pins at the same time when one is saved again', async () => {
    await store().pins.save(samplePin('first', MUG, 0));
    await store().pins.save(samplePin('second', MUG, 0));
    await store().pins.save(samplePin('first', MUG, 0, { state: 'publishing' }));

    expect((await store().pins.listForDesign(MUG)).map((pin) => pin.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('removes a pin', async () => {
    await store().pins.save(samplePin('p1', MUG, 0));

    await store().pins.remove('p1' as PinId);

    expect(await store().pins.listForDesign(MUG)).toEqual([]);
  });
}

/** The lists pins are read in. */
function describePinLists(store: () => PinPersistence): void {
  it('lists the pins of a design, soonest first', async () => {
    await store().pins.save(samplePin('late', MUG, 30));
    await store().pins.save(samplePin('early', MUG, 10));
    await store().pins.save(samplePin('other', BLANKET, 0));

    expect((await store().pins.listForDesign(MUG)).map((pin) => pin.id)).toEqual(['early', 'late']);
  });

  it('lists only planned pins whose time has come', async () => {
    await store().pins.save(samplePin('due', MUG, 0));
    await store().pins.save(samplePin('later', MUG, 59));
    await store().pins.save(samplePin('proposed', MUG, 0, { state: 'proposed' }));
    await store().pins.save(samplePin('failed', BLANKET, 0, { state: 'failed', failure: 'x' }));

    const due = await store().pins.listDue(new Date(Date.UTC(2026, 10, 1, 9, 30)));

    expect(due.map((pin) => pin.id)).toEqual(['due']);
  });

  it('lists the pins in one state, soonest first', async () => {
    await store().pins.save(samplePin('late', MUG, 30, { state: 'publishing' }));
    await store().pins.save(samplePin('early', BLANKET, 10, { state: 'publishing' }));
    await store().pins.save(samplePin('planned', MUG, 0));

    expect((await store().pins.listByState('publishing')).map((pin) => pin.id)).toEqual([
      'early',
      'late',
    ]);
  });
}
