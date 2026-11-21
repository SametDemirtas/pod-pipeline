import { describe, expect, it, vi } from 'vitest';
import { remembered } from './remembered.js';

describe('remembered', () => {
  it('loads once, and again only after a failed load', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('shop');
    const shop = remembered(load);

    await expect(shop()).rejects.toThrow('offline');
    expect(await shop()).toBe('shop');
    expect(await shop()).toBe('shop');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
