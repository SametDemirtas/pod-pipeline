import { describe, expect, it } from 'vitest';
import { busyFailure, classifySdkConnectionError, retryAfterOf } from './sdk-errors.js';

class TimeoutError extends Error {}
class ConnectionError extends Error {}
const sdk = { timeout: TimeoutError, connection: ConnectionError };

const lost = (code: string) =>
  new ConnectionError('Connection error.', {
    cause: new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) }),
  });

describe('classifySdkConnectionError', () => {
  it('tells a request that never got there from one that broke off', () => {
    const classify = (error: unknown) => classifySdkConnectionError(error, 'AI', sdk);

    expect(classify(new TimeoutError())).toEqual({
      kind: 'interrupted',
      service: 'AI',
      reason: 'timed out',
    });
    expect(classify(lost('ENOTFOUND'))).toEqual({ kind: 'unreachable', service: 'AI' });
    expect(classify(lost('ECONNRESET'))).toEqual({
      kind: 'interrupted',
      service: 'AI',
      reason: 'connection lost',
    });
    expect(classify(new ConnectionError())).toMatchObject({ reason: 'connection lost' });
    expect(classify(new Error('other'))).toBeUndefined();
  });
});

describe('busyFailure', () => {
  it('carries the wait the service asked for, when it said', () => {
    expect(busyFailure('AI', retryAfterOf(new Headers({ 'retry-after': '30' })))).toEqual({
      kind: 'busy',
      service: 'AI',
      retryAfterSeconds: 30,
    });
    expect(busyFailure('AI', retryAfterOf(undefined))).toEqual({ kind: 'busy', service: 'AI' });
  });
});
