import { describe, expect, it } from 'vitest';
import { asVendor } from './errors.js';
import { OPENAI } from './vendors.js';

describe('asVendor', () => {
  it('passes on errors that did not come from the SDK as they are', async () => {
    const error = new Error('disk full');

    await expect(asVendor(OPENAI, () => Promise.reject(error))).rejects.toBe(error);
  });
});
