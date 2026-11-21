import { describe, expect, it } from 'vitest';
import {
  classifyNetworkError,
  classifySignInError,
  mayHaveActed,
  readOnlyFailure,
} from './failures.js';

const fetchFailed = (code: string) =>
  new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });

describe('classifyNetworkError', () => {
  it.each([
    [fetchFailed('ENOTFOUND'), { kind: 'unreachable' }],
    [fetchFailed('ECONNREFUSED'), { kind: 'unreachable' }],
    // The request may have arrived before the connection broke.
    [fetchFailed('UND_ERR_SOCKET'), { kind: 'interrupted', reason: 'connection lost' }],
    [new TypeError('fetch failed'), { kind: 'interrupted', reason: 'connection lost' }],
    // The body was cut off while being read, after the service had the request.
    [
      new TypeError('terminated', {
        cause: Object.assign(new Error('x'), { code: 'UND_ERR_SOCKET' }),
      }),
      { kind: 'interrupted', reason: 'connection lost' },
    ],
    [
      new Error('socket hang up', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) }),
      { kind: 'interrupted', reason: 'connection lost' },
    ],
    [
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      { kind: 'interrupted', reason: 'connection lost' },
    ],
    [
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      { kind: 'unreachable' },
    ],
    [
      Object.assign(new Error('Body Timeout Error'), { code: 'UND_ERR_BODY_TIMEOUT' }),
      { kind: 'interrupted', reason: 'connection lost' },
    ],
    [
      Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }),
      { kind: 'interrupted', reason: 'timed out' },
    ],
    [
      Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
      { kind: 'interrupted', reason: 'cancelled' },
    ],
  ])('classifies %s', (error, failure) => {
    expect(classifyNetworkError(error)).toEqual(failure);
  });

  it('leaves other errors alone', () => {
    expect(classifyNetworkError(new Error('x'))).toBeUndefined();
    expect(classifyNetworkError(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBeUndefined();
    expect(
      classifyNetworkError(Object.assign(new Error('x'), { code: 'UND_ERR_INVALID_ARG' })),
    ).toBeUndefined();
    expect(classifyNetworkError('text')).toBeUndefined();
  });
});

describe('mayHaveActed', () => {
  class ShopApiError extends Error {
    constructor(readonly status: number) {
      super(`Shop returned ${String(status)}`);
    }
  }

  it('counts server errors and broken connections, not refusals or unreachable services', () => {
    expect(mayHaveActed(new ShopApiError(502), ShopApiError)).toBe(true);
    expect(mayHaveActed(new ShopApiError(400), ShopApiError)).toBe(false);
    expect(mayHaveActed(new ShopApiError(503), ShopApiError)).toBe(false);
    const reset = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    const refused = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    expect(mayHaveActed(reset, ShopApiError)).toBe(true);
    expect(mayHaveActed(refused, ShopApiError)).toBe(false);
  });
});

describe('classifySignInError', () => {
  const refused = () => ({ kind: 'not-connected', service: 'Shop' }) as const;

  it('reads a network cause as the service unreachable or failed', () => {
    expect(classifySignInError(fetchFailed('ENOTFOUND'), 'Shop', refused)).toEqual({
      kind: 'unreachable',
      service: 'Shop',
    });
    expect(classifySignInError(fetchFailed('ECONNRESET'), 'Shop', refused)).toEqual({
      kind: 'failed',
      service: 'Shop',
      reason: 'connection lost',
    });
  });

  it('leaves any other cause to the service rules', () => {
    expect(classifySignInError(new Error('invalid_grant'), 'Shop', refused)).toEqual(refused());
  });
});

describe('readOnlyFailure', () => {
  it('reads a broken-off read as failed and leaves other failures alone', () => {
    expect(
      readOnlyFailure({ kind: 'interrupted', service: 'Shop', reason: 'connection lost' }),
    ).toEqual({ kind: 'failed', service: 'Shop', reason: 'connection lost' });
    expect(readOnlyFailure({ kind: 'unreachable', service: 'Shop' })).toEqual({
      kind: 'unreachable',
      service: 'Shop',
    });
  });
});
