import { describe, expect, it } from 'vitest';
import { apiPath } from './api-path.js';

describe('apiPath', () => {
  it('encodes each value as one path segment', () => {
    expect(apiPath`/listings/${'123'}/translations/${'de'}`).toBe('/listings/123/translations/de');
    expect(apiPath`/listings/${'1/../shops'}?x=${7}`).toBe('/listings/1%2F..%2Fshops?x=7');
  });

  it('refuses a value that is no path segment of its own', () => {
    for (const value of ['', '.', '..']) {
      expect(() => apiPath`/listings/${value}/images`).toThrow(RangeError);
    }
  });
});
