import { describe, expect, it } from 'vitest';
import { parseJson } from './parse-json.js';

describe('parseJson', () => {
  it('reads JSON and gives undefined for anything else', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('')).toBeUndefined();
    expect(parseJson('<html>')).toBeUndefined();
  });
});
