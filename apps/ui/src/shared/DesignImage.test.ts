import { describe, expect, it } from 'vitest';
import { frameRatio } from './DesignImage.js';

describe('frameRatio', () => {
  it.each([
    [3840, 1648, 2],
    [2560, 3200, 0.8],
    [2160, 3840, 0.75],
    [1000, 1000, 1],
    [0, 100, 1],
  ])('frames a %d x %d image at %d', (width, height, ratio) => {
    expect(frameRatio(width, height)).toBeCloseTo(ratio);
  });
});
