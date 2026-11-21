import { describe, expect, it } from 'vitest';
import { uploadTimeoutMs } from './timeouts.js';

describe('uploadTimeoutMs', () => {
  it('gives an upload a minute and a second more for every 256 KB', () => {
    expect(uploadTimeoutMs(0)).toBe(60_000);
    expect(uploadTimeoutMs(1)).toBe(61_000);
    expect(uploadTimeoutMs(100_000_000)).toBe(60_000 + 1_526_000);
  });
});
