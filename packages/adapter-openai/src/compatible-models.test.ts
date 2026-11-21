import { describe, expect, it } from 'vitest';
import { AiServiceBusyError, AI_ANSWER_FAILURES, type JsonQuestion } from '@pod/adapter-ai';
import { CompatibleModels } from './compatible-models.js';
import { apiError, completion, fakeOpenAi } from './testing/fake-openai.js';
import { DEEPSEEK, KIMI, OPENAI, type OpenAiVendor } from './vendors.js';

const question: JsonQuestion = {
  system: 'Answer in JSON.',
  parts: [
    { image: { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } },
    { text: 'Describe the print.' },
  ],
  effort: 'medium',
  schema: { type: 'object' },
};

function models(
  vendor: OpenAiVendor,
  fetchFn: typeof fetch,
  model = vendor.defaultModel,
  key = 'k',
) {
  return new CompatibleModels(vendor, {
    apiKey: () => Promise.resolve(key || undefined),
    model: () => Promise.resolve(model),
    fetch: fetchFn,
  });
}

async function asked(vendor: OpenAiVendor, model?: string, parts = question.parts) {
  const { sent, fetchFn } = fakeOpenAi(completion('{"title":"T"}'));
  const answer = await (await models(vendor, fetchFn, model).current()).ask({ ...question, parts });
  return { answer, request: sent[0] };
}

const userMessage = {
  role: 'user',
  content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
    { type: 'text', text: 'Describe the print.' },
  ],
};

/** ChatGPT reads images in full tiles, so small print on them can be checked. */
const detailedUserMessage = {
  ...userMessage,
  content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID', detail: 'high' } },
    { type: 'text', text: 'Describe the print.' },
  ],
};

const strictFormat = {
  type: 'json_schema',
  json_schema: { name: 'answer', strict: true, schema: { type: 'object' } },
};

describe('CompatibleModels', () => {
  it.each([
    [OPENAI, 'ChatGPT'],
    [DEEPSEEK, 'DeepSeek'],
    [KIMI, 'Kimi'],
  ])('names the service of %#', async (vendor, service) => {
    const choice = models(vendor, fakeOpenAi(completion('{}')).fetchFn);

    expect(await choice.current()).toMatchObject({ service });
  });

  it('says which key is missing, without asking', async () => {
    const { fetchFn, sent } = fakeOpenAi(completion('{}'));

    await expect(models(KIMI, fetchFn, 'kimi-k3.1-pro', '').current()).rejects.toThrow(
      'Kimi is not connected; add a Moonshot API key first',
    );
    expect(sent).toEqual([]);
  });

  it.each([
    [OPENAI, 'gpt-6-luna', true],
    [OPENAI, 'gpt-7-unlisted', true],
    [KIMI, 'kimi-k3', true],
    [DEEPSEEK, 'deepseek-flash', true],
    [DEEPSEEK, 'deepseek-v4-pro', false],
    [DEEPSEEK, 'deepseek-unlisted', false],
  ])('tells whether %#: %s reads images', async (vendor, model, sees) => {
    const choice = models(vendor, fakeOpenAi(completion('{}')).fetchFn, model);

    expect((await choice.current()).seesImages).toBe(sees);
  });

  it('suggests a default each vendor lists', () => {
    for (const vendor of [OPENAI, DEEPSEEK, KIMI]) {
      expect(vendor.models.map((option) => option.id)).toContain(vendor.defaultModel);
    }
  });
});

describe('CompatibleJsonModel', () => {
  it('asks ChatGPT for the schema strictly, at the question effort', async () => {
    const { answer, request } = await asked(OPENAI);

    expect(answer).toEqual({ kind: 'text', text: '{"title":"T"}' });
    expect(request?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request?.headers.get('authorization')).toBe('Bearer k');
    expect(request?.body).toEqual({
      model: 'gpt-6.1-sol',
      messages: [{ role: 'system', content: 'Answer in JSON.' }, detailedUserMessage],
      response_format: strictFormat,
      reasoning_effort: 'medium',
      max_completion_tokens: 16_000,
    });
  });

  it('asks DeepSeek for any JSON object, with the schema in the prompt and no reasoning', async () => {
    const { request } = await asked(DEEPSEEK);

    expect(request?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(request?.body).toEqual({
      model: 'deepseek-flash',
      messages: [
        {
          role: 'system',
          content:
            'Answer in JSON.\n\nAnswer with one JSON object and nothing else, ' +
            'matching this JSON Schema:\n{"type":"object"}',
        },
        userMessage,
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 16_000,
    });
  });

  it('asks Kimi for the schema strictly, with little reasoning', async () => {
    const { request } = await asked(KIMI);

    expect(request?.url).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(request?.body).toEqual({
      model: 'kimi-k3.1-pro',
      messages: [{ role: 'system', content: 'Answer in JSON.' }, userMessage],
      response_format: strictFormat,
      reasoning_effort: 'low',
      max_completion_tokens: 16_000,
    });
  });

  it('sends only the parts it is given', async () => {
    const { request } = await asked(DEEPSEEK, 'deepseek-v4-pro', [{ text: 'Name it.' }]);

    expect(request?.body['messages']).toContainEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Name it.' }],
    });
  });

  it.each([
    ['a refusal', completion(null, 'stop', 'I cannot help.'), { kind: 'refused' }],
    ['a filtered answer', completion('', 'content_filter'), { kind: 'refused' }],
    ['a cut-off answer', completion('{"title":', 'length'), { kind: 'cut-off' }],
    ['no text at all', completion(null), { kind: 'text', text: undefined }],
    ['empty text', completion(''), { kind: 'text', text: undefined }],
    ['no choice at all', { ...completion(''), choices: [] }, { kind: 'text', text: undefined }],
  ])('passes on %s', async (_case, reply, answer) => {
    const model = await models(OPENAI, fakeOpenAi(reply).fetchFn).current();

    expect(await model.ask(question)).toEqual(answer);
  });

  it('reports DeepSeek running short of servers as busy, to try again later', async () => {
    const reply = completion('{"title":', 'insufficient_system_resource');
    const model = await models(DEEPSEEK, fakeOpenAi(reply).fetchFn).current();

    const error: unknown = await model.ask(question).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiServiceBusyError);
    expect(AI_ANSWER_FAILURES.classify(error)).toEqual({ kind: 'busy', service: 'DeepSeek' });
  });

  it('asks once more when the vendor is overloaded, naming the vendor', async () => {
    const { sent, fetchFn } = fakeOpenAi(apiError('Overloaded', 'server_overloaded'), 503);
    const model = await models(DEEPSEEK, fetchFn).current();

    await expect(model.ask(question)).rejects.toMatchObject({ service: 'DeepSeek' });
    expect(sent).toHaveLength(2);
  });

  it('does not ask again after a server error, which may already be billed', async () => {
    const { sent, fetchFn } = fakeOpenAi(apiError('Server error', 'server_error'), 500);
    const model = await models(DEEPSEEK, fetchFn).current();

    await expect(model.ask(question)).rejects.toMatchObject({ service: 'DeepSeek' });
    expect(sent).toHaveLength(1);
  });
});
