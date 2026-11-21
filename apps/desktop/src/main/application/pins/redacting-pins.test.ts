import { expect, it, vi } from 'vitest';
import type { DesignId } from '@pod/core';
import { InMemoryPins } from '@pod/core/testing';
import { samplePin } from '@pod/core/testing/contract';
import { redactingPins } from './redacting-pins.js';

it('stores why a pin failed without a token the service named', async () => {
  const stored = new InMemoryPins();
  const pin = samplePin('p1', 'design-1' as DesignId, 0, {
    state: 'failed',
    failure: 'Pinterest returned 401 for Bearer pina_AbCd-123_xyz',
  });

  await redactingPins(stored).save(pin);

  expect((await stored.get(pin.id))?.failure).toBe('Pinterest returned 401 for Bearer [hidden]');
});

it('passes every read and a pin without a failure on as they are', async () => {
  const stored = new InMemoryPins();
  const pins = redactingPins(stored);
  const due = samplePin('p2', 'design-1' as DesignId, 0, { state: 'planned' });
  const save = vi.spyOn(stored, 'save');

  await pins.save(due);

  expect(save).toHaveBeenCalledWith(due);
  expect(await pins.get(due.id)).toEqual(due);
  expect(await pins.listForDesign(due.designId)).toEqual([due]);
  expect(await pins.listByState('planned')).toEqual(await stored.listByState('planned'));
  expect(await pins.listDue(new Date(8_640_000_000_000_000))).toEqual(
    await stored.listDue(new Date(8_640_000_000_000_000)),
  );
  await pins.remove(due.id);
  expect(await stored.get(due.id)).toBeUndefined();
});
