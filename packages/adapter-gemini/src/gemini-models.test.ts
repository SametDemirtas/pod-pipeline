import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonQuestion } from '@pod/adapter-ai';
import { GEMINI_FAILURES } from './classify-error.js';
import { GeminiModels } from './gemini-models.js';
import { fakeGemini } from './testing/fake-gemini.js';
import { GEMINI_TEXT_MODELS } from './text-models.js';

const question: JsonQuestion = {
  system: 'Answer in JSON.',
  parts: [
    { image: { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } },
    { text: 'Describe the print.' },
  ],
  effort: 'low',
  schema: { type: 'object' },
};

const waits: number[] = [];

function gemini(fetchFn?: typeof fetch, key = 'gk', model = 'gemini-3.8-flash') {
  return new GeminiModels({
    apiKey: () => Promise.resolve(key || undefined),
    model: () => Promise.resolve(model),
    ...(fetchFn ? { fetch: fetchFn } : {}),
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  waits.length = 0;
});

const answer = (candidate: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  fakeGemini({ body: { candidates: [candidate], ...extra } });

const ask = async (fetchFn: typeof fetch) => (await gemini(fetchFn).current()).ask(question);

describe('GeminiModels', () => {
  it('names the service and offers a model that reads images', async () => {
    const models = gemini(fakeGemini().fetchFn);

    expect(await models.current()).toMatchObject({ service: 'Gemini', seesImages: true });
  });

  it('asks through the global fetch unless given one', async () => {
    const { sent, fetchFn } = fakeGemini({ body: {} });
    vi.stubGlobal('fetch', fetchFn);

    await (await gemini().current()).ask(question);

    expect(sent).toHaveLength(1);
  });

  it('takes a model missing from the catalog to read images, as every Gemini model does', async () => {
    expect((await gemini(fakeGemini().fetchFn, 'gk', 'gemini-5-new').current()).seesImages).toBe(
      true,
    );
  });

  it('says when no key is saved', async () => {
    const { fetchFn, sent } = fakeGemini();

    await expect(gemini(fetchFn, '').current()).rejects.toThrow(/not connected/);
    expect(sent).toEqual([]);
  });

  it('suggests its default among models that read images', () => {
    const { defaultModel, models } = GEMINI_TEXT_MODELS;

    expect(models.map((model) => model.id)).toContain(defaultModel);
    expect(models.every((model) => model.seesImages)).toBe(true);
  });
});

describe('GeminiJsonModel', () => {
  it('asks for JSON in the schema and returns the text it wrote, without thoughts', async () => {
    const { sent, fetchFn } = answer({
      finishReason: 'STOP',
      content: {
        parts: [{ text: 'Considering…', thought: true }, { text: '{"title":' }, { text: '"T"}' }],
      },
    });

    expect(await ask(fetchFn)).toEqual({ kind: 'text', text: '{"title":"T"}' });
    expect(sent[0]).toEqual({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      method: 'POST',
      headers: { 'x-goog-api-key': 'gk', 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: 'Answer in JSON.' }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: 'AQID' } },
              { text: 'Describe the print.' },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object' },
          maxOutputTokens: 16_000,
          thinkingConfig: { thinkingLevel: 'LOW' },
        },
      },
    });
  });

  it.each([
    ['a blocked prompt', fakeGemini({ body: { promptFeedback: { blockReason: 'SAFETY' } } })],
    ['a stop for safety', answer({ finishReason: 'SAFETY' })],
    ['prohibited content', answer({ finishReason: 'PROHIBITED_CONTENT' })],
    ['a blocklisted term', answer({ finishReason: 'BLOCKLIST' })],
    ['copied text', answer({ finishReason: 'RECITATION' })],
    ['personal data', answer({ finishReason: 'SPII' })],
  ])('passes on %s as a refusal', async (_case, fake) => {
    expect(await ask(fake.fetchFn)).toEqual({ kind: 'refused' });
  });

  it.each([
    [
      'a cut-off answer',
      answer({ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }),
      { kind: 'cut-off' },
    ],
    ['no candidate at all', fakeGemini({ body: {} }), { kind: 'text', text: undefined }],
    [
      'a candidate without text',
      answer({ finishReason: 'STOP' }),
      { kind: 'text', text: undefined },
    ],
  ])('passes on %s', async (_case, fake, expected) => {
    expect(await ask(fake.fetchFn)).toEqual(expected);
  });

  it('thinks at the medium level for a medium question', async () => {
    const { sent, fetchFn } = answer({ finishReason: 'STOP' });

    await (await gemini(fetchFn).current()).ask({ ...question, effort: 'medium' });

    expect(sent[0]?.body).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: 'MEDIUM' } },
    });
  });

  it("reports Gemini's error after trying a rate limit once more", async () => {
    const limited = { status: 429, body: { error: { message: 'Resource exhausted' } } };
    const { fetchFn, sent } = fakeGemini(limited, limited);

    await expect(ask(fetchFn)).rejects.toMatchObject({
      message: 'Gemini returned 429: Resource exhausted',
      status: 429,
    });
    expect(sent).toHaveLength(2);
  });

  it('tells a used-up daily quota from a per-minute rate limit', async () => {
    const limited = (quotaId: string) => ({
      status: 429,
      body: {
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'You exceeded your current quota.',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [{ quotaMetric: 'generativelanguage.googleapis.com/requests', quotaId }],
            },
          ],
        },
      },
    });
    const daily = limited('GenerateRequestsPerDayPerProjectPerModel-FreeTier');
    const perMinute = limited('GenerateRequestsPerMinutePerProjectPerModel');

    const usedUp = await ask(fakeGemini(daily, daily).fetchFn).catch((error: unknown) => error);
    const busy = await ask(fakeGemini(perMinute, perMinute).fetchFn).catch((e: unknown) => e);

    expect(GEMINI_FAILURES.classify(usedUp)).toMatchObject({ kind: 'failed', service: 'Gemini' });
    expect(GEMINI_FAILURES.classify(busy)).toEqual({ kind: 'busy', service: 'Gemini' });
  });

  it('answers after an overloaded model recovers', async () => {
    const { fetchFn } = fakeGemini(
      { status: 503, body: { error: { message: 'overloaded' } } },
      { body: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } },
    );

    expect(await ask(fetchFn)).toEqual({ kind: 'text', text: '{}' });
    expect(waits).toEqual([2000]);
  });

  it.each([500, 502, 504])('does not resend a question after a %i', async (status) => {
    const failed = { status, body: { error: { message: 'internal' } } };
    const { fetchFn, sent } = fakeGemini(failed, failed);

    await expect(ask(fetchFn)).rejects.toMatchObject({ status });
    expect(sent).toHaveLength(1);
  });

  it('refuses an answer that is not JSON', async () => {
    const fetchFn: typeof fetch = () => Promise.resolve(new Response('<html>ok</html>'));

    await expect(ask(fetchFn)).rejects.toThrow('Gemini sent an answer that could not be read');
  });
});
