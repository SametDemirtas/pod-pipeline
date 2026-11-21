import { describe, expect, it } from 'vitest';
import { UnsupportedPngError } from '../errors.js';
import { filtered, unfilter } from './filters.js';

describe('PNG filters', () => {
  it('restore what each of the five filters stored', () => {
    const previous = Uint8Array.from([10, 20, 30, 40, 50, 60]);
    const line = Uint8Array.from([200, 5, 17, 255, 0, 99]);
    for (let type = 0; type <= 4; type += 1) {
      const stored = filtered(type, line, previous, 3);
      const restored = stored.slice(1);
      unfilter(type, restored, previous, 3);

      expect(stored[0]).toBe(type);
      expect(restored).toEqual(line);
    }
    expect(Array.from(filtered(1, line, previous, 3).slice(1))).toEqual([200, 5, 17, 55, 251, 82]);
    expect(() => {
      unfilter(5, line, previous, 3);
    }).toThrow(new UnsupportedPngError('filter type 5'));
  });
});
