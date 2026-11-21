import type { DesignId } from '../catalog/model.js';
import { PinPublishingError } from '../errors.js';
import type { PinRepository } from '../ports/pins.js';
import { requirePin } from './require-pin.js';

/**
 * Forgets a pin in the app. A published one stays on Pinterest; one being
 * published is left until that finishes. Its image goes with the next sweep of
 * unused files.
 */
export class RemovePin {
  constructor(private readonly pins: Pick<PinRepository, 'get' | 'remove'>) {}

  async execute(id: string): Promise<DesignId> {
    const pin = await requirePin(this.pins, id);
    if (pin.state === 'publishing') throw new PinPublishingError(id);
    await this.pins.remove(pin.id);
    return pin.designId;
  }
}
