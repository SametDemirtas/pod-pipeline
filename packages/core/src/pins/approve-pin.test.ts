import { describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError } from '../errors.js';
import { samplePin } from '../testing/contract/index.js';
import { InMemoryPins } from '../testing/index.js';
import { ApprovePin } from './approve-pin.js';
import type { PinId } from './pin.js';

const MUG = 'design-01-mug' as DesignId;

describe('ApprovePin', () => {
  it('plans a proposed pin once and leaves other states alone', async () => {
    const pins = new InMemoryPins();
    await pins.save(samplePin('p1', MUG, 0, { state: 'proposed' }));
    await pins.save(samplePin('p2', MUG, 0, { state: 'published', publishedId: '9' }));
    const approve = new ApprovePin(pins);

    expect((await approve.execute('p1')).state).toBe('planned');
    expect((await approve.execute('p1')).state).toBe('planned');
    expect((await approve.execute('p2')).state).toBe('published');
    expect((await pins.get('p1' as PinId))?.state).toBe('planned');
  });

  it('needs the pin', async () => {
    await expect(new ApprovePin(new InMemoryPins()).execute('gone')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
