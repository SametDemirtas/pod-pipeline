import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { checkOpenAiCompatibleKey } from './check-key.js';
import { OPENAI_COMPATIBLE_FAILURES } from './classify-error.js';
import { CompatibleModels } from './compatible-models.js';
import { OpenAiNotConnectedError, OpenAiVendorError } from './errors.js';
import { apiError, fakeOpenAi } from './testing/fake-openai.js';
import { DEEPSEEK, KIMI, OPENAI, type OpenAiVendor } from './vendors.js';

/** The error a key check fails with when the vendor answers `status` with `body`. */
const checkError = (
  body: unknown,
  status: number,
  vendor: OpenAiVendor = OPENAI,
): Promise<unknown> =>
  checkOpenAiCompatibleKey(vendor, 'k', fakeOpenAi(body, status).fetchFn).catch(
    (error: unknown) => error,
  );

describe('OPENAI_COMPATIBLE_FAILURES', () => {
  it('tells a missing or refused key from other failures', async () => {
    const refused = await checkError(
      apiError('Authentication Fails', 'authentication_error'),
      401,
      DEEPSEEK,
    );
    const busy = await checkError(apiError('Rate limit reached'), 429);
    const forbidden = await checkError(apiError('no access to model'), 403);

    expect(OPENAI_COMPATIBLE_FAILURES.classify(new OpenAiNotConnectedError(KIMI))).toEqual({
      kind: 'not-connected',
      service: 'Kimi',
    });
    expect(OPENAI_COMPATIBLE_FAILURES.classify(refused)).toEqual({
      kind: 'not-connected',
      service: 'DeepSeek',
    });
    expect(OPENAI_COMPATIBLE_FAILURES.classify(busy)).toMatchObject({
      kind: 'busy',
      service: 'ChatGPT',
    });
    const broke = new OpenAI.RateLimitError(
      429,
      { code: 'insufficient_quota', message: 'quota' },
      'You exceeded your current quota',
      new Headers(),
    );
    expect(
      OPENAI_COMPATIBLE_FAILURES.classify(new OpenAiVendorError('ChatGPT', broke)),
    ).toMatchObject({
      kind: 'failed',
    });
    for (const status of [503, 529]) {
      const overloaded = OpenAI.APIError.generate(status, {}, 'Server busy', new Headers());
      expect(
        OPENAI_COMPATIBLE_FAILURES.classify(new OpenAiVendorError('DeepSeek', overloaded)),
      ).toEqual({
        kind: 'busy',
        service: 'DeepSeek',
      });
    }
    expect(OPENAI_COMPATIBLE_FAILURES.classify(forbidden)).toMatchObject({
      kind: 'failed',
      reason: expect.stringContaining('no access to model') as string,
    });
    expect(OPENAI_COMPATIBLE_FAILURES.classify(new Error('other'))).toBeUndefined();
    expect(
      OPENAI_COMPATIBLE_FAILURES.classify(
        new OpenAI.AuthenticationError(401, {}, 'untagged', new Headers()),
      ),
    ).toBeUndefined();
  });

  it('tells a service that cannot be reached from a request that broke off', async () => {
    const failing = (code: string): Promise<unknown> =>
      new CompatibleModels(KIMI, {
        apiKey: () => Promise.resolve('k'),
        model: () => Promise.resolve('kimi-k3.1-pro'),
        fetch: () =>
          Promise.reject(
            new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) }),
          ),
      })
        .current()
        .then((model) =>
          model.ask({ system: '', parts: [{ text: 'Hi' }], effort: 'low', schema: {} }),
        )
        .catch((error: unknown) => error);

    expect(OPENAI_COMPATIBLE_FAILURES.classify(await failing('ENOTFOUND'))).toEqual({
      kind: 'unreachable',
      service: 'Kimi',
    });
    expect(OPENAI_COMPATIBLE_FAILURES.classify(await failing('ECONNRESET'))).toEqual({
      kind: 'interrupted',
      service: 'Kimi',
      reason: 'connection lost',
    });
    const lost = new OpenAiVendorError('Kimi', new OpenAI.APIConnectionError({}));
    expect(OPENAI_COMPATIBLE_FAILURES.classify(lost)).toMatchObject({
      kind: 'interrupted',
      reason: 'connection lost',
    });
    const slow = new OpenAiVendorError('ChatGPT', new OpenAI.APIConnectionTimeoutError());
    expect(OPENAI_COMPATIBLE_FAILURES.classify(slow)).toEqual({
      kind: 'interrupted',
      service: 'ChatGPT',
      reason: 'timed out',
    });
  });
});
