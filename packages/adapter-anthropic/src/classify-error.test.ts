import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { checkAnthropicKey } from './check-key.js';
import { anthropicClient } from './anthropic-client.js';
import { ClaudeJsonModel } from './claude-json-model.js';
import { CLAUDE_FAILURES } from './classify-error.js';
import { AnthropicNotConnectedError } from './errors.js';
import { fakeClaude } from './testing/fake-claude.js';

/** The error a key check fails with when Anthropic answers `status` with `body`. */
const checkError = (body: Record<string, unknown>, status: number): Promise<unknown> =>
  checkAnthropicKey('k', fakeClaude(body, status).fetchFn).catch((error: unknown) => error);

const apiError = (type: string, text: string) => ({
  type: 'error',
  error: { type, message: text },
});

describe('CLAUDE_FAILURES', () => {
  it('tells a missing or refused key from other failures', async () => {
    const refused = await checkError(apiError('authentication_error', 'invalid x-api-key'), 401);
    const busy = await checkError(apiError('invalid_request_error', 'bad request'), 400);
    const forbidden = await checkError(apiError('permission_error', 'no access to model'), 403);

    expect(CLAUDE_FAILURES.classify(new AnthropicNotConnectedError())).toEqual({
      kind: 'not-connected',
      service: 'Claude',
    });
    expect(CLAUDE_FAILURES.classify(refused)).toEqual({ kind: 'not-connected', service: 'Claude' });
    expect(CLAUDE_FAILURES.classify(busy)).toMatchObject({ kind: 'failed' });
    expect(CLAUDE_FAILURES.classify(forbidden)).toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('no access to model') as string,
    });
    expect(CLAUDE_FAILURES.classify(new Error('other'))).toBeUndefined();
  });

  it('reads a rate limit or an overloaded API as busy, with the wait Anthropic asks for', async () => {
    const limited = await checkAnthropicKey(
      'k',
      fakeClaude(apiError('rate_limit_error', 'slow down'), 429).fetchFn,
    ).catch((error: unknown) => error);
    const overloaded = await checkError(apiError('overloaded_error', 'Overloaded'), 529);

    expect(CLAUDE_FAILURES.classify(limited)).toMatchObject({ kind: 'busy', service: 'Claude' });
    expect(CLAUDE_FAILURES.classify(overloaded)).toEqual({ kind: 'busy', service: 'Claude' });
    expect(
      CLAUDE_FAILURES.classify(
        new Anthropic.RateLimitError(429, {}, 'slow down', new Headers({ 'retry-after': '20' })),
      ),
    ).toEqual({ kind: 'busy', service: 'Claude', retryAfterSeconds: 20 });
  });

  it('tells a Claude that cannot be reached from a request that broke off', async () => {
    // Without retries, so the test does not sit out the SDK's backoff.
    const failing = (code: string): Promise<unknown> =>
      new ClaudeJsonModel(
        anthropicClient('sk-test', {
          timeout: 1_000,
          maxRetries: 0,
          fetch: () =>
            Promise.reject(
              new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) }),
            ),
        }),
        'claude-opus-5-5',
      )
        .ask({ system: '', parts: [{ text: 'Hi' }], effort: 'low', schema: {} })
        .catch((error: unknown) => error);

    expect(CLAUDE_FAILURES.classify(await failing('ENOTFOUND'))).toEqual({
      kind: 'unreachable',
      service: 'Claude',
    });
    expect(CLAUDE_FAILURES.classify(await failing('ECONNRESET'))).toEqual({
      kind: 'interrupted',
      service: 'Claude',
      reason: 'connection lost',
    });
    expect(CLAUDE_FAILURES.classify(new Anthropic.APIConnectionError({}))).toMatchObject({
      kind: 'interrupted',
      reason: 'connection lost',
    });
    expect(CLAUDE_FAILURES.classify(new Anthropic.APIConnectionTimeoutError())).toEqual({
      kind: 'interrupted',
      service: 'Claude',
      reason: 'timed out',
    });
  });
});
