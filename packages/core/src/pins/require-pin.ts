import { NotFoundError } from '../errors.js';
import type { PinRepository } from '../ports/pins.js';
import type { Pin, PinId } from './pin.js';

/** The pin, or `NotFoundError` when there is none. */
export async function requirePin(pins: Pick<PinRepository, 'get'>, id: string): Promise<Pin> {
  const pin = await pins.get(id as PinId);
  if (!pin) throw new NotFoundError('Pin', id);
  return pin;
}
