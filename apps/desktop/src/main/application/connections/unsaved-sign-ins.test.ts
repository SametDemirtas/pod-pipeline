import { expect, it, vi } from 'vitest';
import { UnsavedSignIns } from './unsaved-sign-ins.js';

it('lists services whose sign-in was not saved until they are connected again', () => {
  const unsaved = new UnsavedSignIns();
  const logError = vi.fn();

  unsaved.failed('etsy', new Error('disk full'), logError);
  unsaved.failed('pinterest', new Error('disk full'), logError);
  unsaved.settled('pinterest');

  expect(unsaved.list()).toEqual(['etsy']);
  expect(logError).toHaveBeenCalledTimes(2);
});
