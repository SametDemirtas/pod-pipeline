import { describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError, PinPublishingError } from '../errors.js';
import { samplePin } from '../testing/contract/index.js';
import { InMemoryPins } from '../testing/index.js';
import { RemovePin } from './remove-pin.js';

const MUG = 'design-01-mug' as DesignId;

describe('RemovePin', () => {
  it('forgets a pin and says whose it was', async () => {
    const pins = new InMemoryPins();
    await pins.save(samplePin('p1', MUG, 0, { state: 'published', publishedId: '9' }));

    expect(await new RemovePin(pins).execute('p1')).toBe(MUG);
    expect(await pins.listForDesign(MUG)).toEqual([]);
  });

  it('leaves a pin being published, and needs the pin', async () => {
    const pins = new InMemoryPins();
    await pins.save(samplePin('p1', MUG, 0, { state: 'publishing' }));

    await expect(new RemovePin(pins).execute('p1')).rejects.toBeInstanceOf(PinPublishingError);
    await expect(new RemovePin(pins).execute('gone')).rejects.toBeInstanceOf(NotFoundError);
  });
});
