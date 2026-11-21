import { describe, expect, it } from 'vitest';
import { GEMINI_FAILURES } from './classify-error.js';
import { GeminiError, GeminiNotConnectedError, GeminiSceneUnfinishedError } from './errors.js';

describe('GEMINI_FAILURES', () => {
  it.each([
    ['a missing key', new GeminiNotConnectedError()],
    ['a refused key', new GeminiError('Gemini returned 401: no', { status: 401 })],
    [
      'a mistyped key',
      new GeminiError('Gemini returned 400: bad', { status: 400, reason: 'API_KEY_INVALID' }),
    ],
    [
      'an expired key',
      new GeminiError('Gemini returned 400: old', { status: 400, reason: 'API_KEY_EXPIRED' }),
    ],
  ])('asks for a new key after %s', (_case, error) => {
    expect(GEMINI_FAILURES.classify(error)).toEqual({ kind: 'not-connected', service: 'Gemini' });
  });

  it('passes on other failures with their reason', () => {
    const error = new GeminiError('Gemini returned 403: billing', {
      status: 403,
      reason: 'BILLING_DISABLED',
    });

    expect(GEMINI_FAILURES.classify(error)).toEqual({
      kind: 'failed',
      service: 'Gemini',
      reason: 'Gemini returned 403: billing',
    });
  });

  it('reads a rate limit or an overloaded model as busy', () => {
    const limited = new GeminiError('Gemini returned 429: quota', {
      status: 429,
      retryAfterSeconds: 30,
    });

    expect(GEMINI_FAILURES.classify(limited)).toEqual({
      kind: 'busy',
      service: 'Gemini',
      retryAfterSeconds: 30,
    });
    expect(GEMINI_FAILURES.classify(new GeminiError('overloaded', { status: 503 }))).toEqual({
      kind: 'busy',
      service: 'Gemini',
    });
  });

  it('reads a used-up daily quota as a failure, as waiting does not cure it', () => {
    const usedUp = new GeminiError('Gemini returned 429: quota', {
      status: 429,
      quotaUsedUp: true,
    });

    expect(GEMINI_FAILURES.classify(usedUp)).toEqual({
      kind: 'failed',
      service: 'Gemini',
      reason: 'Gemini returned 429: quota',
    });
  });

  it('reads a scene that did not finish in time as interrupted, as it may be billed', () => {
    expect(GEMINI_FAILURES.classify(new GeminiSceneUnfinishedError())).toEqual({
      kind: 'interrupted',
      service: 'Gemini',
      reason: 'timed out',
    });
  });

  it('leaves errors from elsewhere to others', () => {
    expect(GEMINI_FAILURES.classify(new Error('other'))).toBeUndefined();
  });
});
