import { describe, expect, it } from 'vitest';
import { ApiError, isApiErrorCode, unwrapResult } from './errors.js';

describe('results and errors', () => {
  it('unwraps a successful result', () => {
    expect(unwrapResult({ ok: true, value: 42 })).toBe(42);
  });

  it('turns a failed result into an ApiError', () => {
    let caught: unknown;
    try {
      unwrapResult({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'gone', details: { id: 'x' } },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ code: 'NOT_FOUND', message: 'gone', details: { id: 'x' } });
  });

  it('recognises known error codes only', () => {
    expect(isApiErrorCode('CONFLICT')).toBe(true);
    expect(isApiErrorCode('SOMETHING')).toBe(false);
    expect(isApiErrorCode(404)).toBe(false);
  });
});
