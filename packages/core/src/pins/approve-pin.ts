import type { PinRepository } from '../ports/pins.js';
import type { Pin } from './pin.js';
import { requirePin } from './require-pin.js';

/** The seller's approval turns an assistant's proposal into a planned pin. */
export class ApprovePin {
  constructor(private readonly pins: Pick<PinRepository, 'get' | 'save'>) {}

  async execute(id: string): Promise<Pin> {
    const pin = await requirePin(this.pins, id);
    if (pin.state !== 'proposed') return pin;
    const planned: Pin = { ...pin, state: 'planned' };
    await this.pins.save(planned);
    return planned;
  }
}
