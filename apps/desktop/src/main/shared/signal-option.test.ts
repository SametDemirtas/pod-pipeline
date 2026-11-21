import { describe, expect, it } from 'vitest';
import { signalOption } from './signal-option.js';

describe('signalOption', () => {
  it('names the signal only when there is one', () => {
    const { signal } = new AbortController();

    expect(signalOption(signal)).toEqual({ signal });
    expect(signalOption(undefined)).toEqual({});
  });
});
