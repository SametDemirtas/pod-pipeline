import { describe, expect, it } from 'vitest';
import { byName } from '../testing/operation-by-name.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { catalogOperations } from './operations.js';
import { makeDesktopOperations, fakePins, fakeBatch } from '../testing/desktop-operation-fakes.js';

describe('batch operations', () => {
  const request = {
    selection: { kind: 'filter', familyId: 'mug' },
    steps: ['mockups', 'text', 'draft'],
    market: 'US',
  };

  it('let assistants read the status, and only the window start or change a job', async () => {
    const catalog = fakeCatalog();
    const batch = fakeBatch();
    const operations = makeDesktopOperations({ catalog, batch });
    const local = catalogOperations(catalog).map((operation) => operation.name);

    for (const name of [
      'estimateBatch',
      'startBatch',
      'cancelBatch',
      'resumeBatch',
      'retryBatch',
    ]) {
      expect(local).not.toContain(name);
    }
    await expect(byName(operations, 'getBatchStatus').handle(undefined)).resolves.toEqual({
      job: null,
    });
    await byName(operations, 'startBatch').handle(request);
    expect(batch.startBatch).toHaveBeenCalledWith(request);
    await expect(byName(operations, 'estimateBatch').handle(request)).rejects.toThrow(
      'unexpected call',
    );
    for (const name of ['cancelBatch', 'resumeBatch', 'retryBatch'] as const) {
      await byName(operations, name).handle(undefined);
      expect(batch[name]).toHaveBeenCalled();
    }
    await byName(operations, 'confirmDraftsChecked').handle({ id: 'd1' });
    expect(batch.confirmDraftsChecked).toHaveBeenCalledWith({ id: 'd1' });
    expect(local).not.toContain('confirmDraftsChecked');
    await expect(byName(operations, 'getBatchListingText').handle({ id: 'd1' })).resolves.toBe(
      null,
    );
    expect(batch.getBatchListingText).toHaveBeenCalledWith({ id: 'd1' });
    expect(local).not.toContain('getBatchListingText');
  });

  it('refuse drafts without their text and mockups', async () => {
    const batch = fakeBatch();
    const operations = makeDesktopOperations({ batch });

    await expect(
      byName(operations, 'startBatch').handle({ ...request, steps: ['draft'] }),
    ).rejects.toThrow();
    expect(batch.startBatch).not.toHaveBeenCalled();
  });
});

describe('pin operations', () => {
  const plan = {
    designId: 'd1',
    mockupId: 'm1',
    title: 'Tulip mug',
    description: '',
    altText: '',
    headline: 'Spooky',
    boardId: '11',
    publishAt: '2026-10-27T09:00:00.000+03:00',
  };

  it('let assistants only propose, and the window plan, approve and publish', async () => {
    const catalog = fakeCatalog();
    const pins = fakePins();
    const operations = makeDesktopOperations({ catalog, pins });
    const local = catalogOperations(catalog).map((operation) => operation.name);

    expect(local).not.toContain('planPin');
    expect(local).not.toContain('publishPinNow');
    await expect(byName(operations, 'proposePin').handle(plan)).rejects.toThrow('unexpected call');
    expect(catalog.proposePin).toHaveBeenCalledWith(plan);
    await expect(byName(operations, 'planPin').handle(plan)).rejects.toThrow('unexpected call');
    expect(pins.planPin).toHaveBeenCalledWith(plan);
    await byName(operations, 'removePin').handle({ id: 'p1' });
    expect(pins.removePin).toHaveBeenCalledWith({ id: 'p1' });
    await expect(byName(operations, 'approvePin').handle({ id: 'p1' })).rejects.toThrow();
    await expect(byName(operations, 'publishPinNow').handle({ id: 'p1' })).rejects.toThrow();
    await byName(operations, 'listPins').handle({ id: 'd1' });
    await byName(operations, 'listBoards').handle(undefined);
    expect(catalog.listBoards).toHaveBeenCalled();
  });

  it('refuse a pin without a board id or a time zone', async () => {
    const operations = catalogOperations(fakeCatalog());

    await expect(
      byName(operations, 'proposePin').handle({ ...plan, boardId: 'mugs' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'proposePin').handle({ ...plan, publishAt: 'tomorrow' }),
    ).rejects.toThrow();
  });
});
