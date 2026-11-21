import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from './api.js';
import { assetUrl } from './urls.js';

describe('desktop wiring', () => {
  it('uses one distinct channel per operation', () => {
    const channels = Object.values(IPC_CHANNELS);

    expect(new Set(channels).size).toBe(channels.length);
  });

  it('builds asset URLs with an optional width', () => {
    expect(assetUrl('ab/abc.png')).toBe('pod-asset://asset/ab/abc.png');
    expect(assetUrl('ab/abc.png', 320)).toBe('pod-asset://asset/ab/abc.png?w=320');
  });
});
