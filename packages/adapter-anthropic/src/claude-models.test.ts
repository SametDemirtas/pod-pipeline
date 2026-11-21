import { describe, expect, it } from 'vitest';
import type { JsonQuestion } from '@pod/adapter-ai';
import { ClaudeModels } from './claude-models.js';
import { fakeClaude, message } from './testing/fake-claude.js';

const question: JsonQuestion = {
  system: 'Answer in JSON.',
  parts: [
    { image: { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } },
    { text: 'Describe the print.' },
  ],
  effort: 'medium',
  schema: { type: 'object' },
};

function claude(fetchFn: typeof fetch, model = 'claude-opus-5-5', key = 'sk-test') {
  return new ClaudeModels({
    apiKey: () => Promise.resolve(key || undefined),
    model: () => Promise.resolve(model),
    fetch: fetchFn,
  });
}

const ask = async (fetchFn: typeof fetch, model?: string) =>
  (await claude(fetchFn, model).current()).ask(question);

describe('ClaudeModels', () => {
  it('names the service and offers a model that reads images', async () => {
    const models = claude(fakeClaude(message('{}')).fetchFn);

    expect(await models.current()).toMatchObject({ service: 'Claude', seesImages: true });
  });

  it('never sends a question again after its connection broke, which may have been billed', async () => {
    let tries = 0;
    const broken: typeof fetch = () => {
      tries += 1;
      return Promise.reject(new TypeError('fetch failed'));
    };

    await expect(ask(broken)).rejects.toBeDefined();
    expect(tries).toBe(1);
  });

  it('says when no key is saved', async () => {
    const { fetchFn, sent } = fakeClaude(message('{}'));

    await expect(claude(fetchFn, 'claude-opus-5-5', '').current()).rejects.toThrow(/not connected/);
    expect(sent).toEqual([]);
  });
});

describe('ClaudeJsonModel', () => {
  it('sends the parts in order and returns the text it wrote', async () => {
    const { sent, fetchFn } = fakeClaude(message('{"title":"T"}'));

    expect(await ask(fetchFn)).toEqual({ kind: 'text', text: '{"title":"T"}' });

    const [request] = sent;
    expect(request?.url).toMatch(/^https:\/\/api.anthropic.com\/v1\/messages/);
    expect(request?.headers.get('authorization')).toBe('Bearer sk-test');
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(request?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16_000,
      fallbacks: 'default',
      system: 'Answer in JSON.',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } },
            { type: 'text', text: 'Describe the print.' },
          ],
        },
      ],
    });
  });

  it('asks without the fallback for a model that does not take it', async () => {
    const { sent, fetchFn } = fakeClaude(message('{}'));

    await ask(fetchFn, 'claude-haiku-5-5');

    expect(sent[0]?.body).not.toHaveProperty('fallbacks');
    expect(sent[0]?.headers.get('anthropic-beta')).toBeNull();
    expect(sent[0]?.body).toMatchObject({ model: 'claude-haiku-5-5' });
  });

  it.each([
    ['a refusal', message('', 'refusal'), { kind: 'refused' }],
    ['a cut-off answer', message('{"title":', 'max_tokens'), { kind: 'cut-off' }],
    ['no text at all', { ...message(''), content: [] }, { kind: 'text', text: undefined }],
  ])('passes on %s', async (_case, reply, answer) => {
    expect(await ask(fakeClaude(reply).fetchFn)).toEqual(answer);
  });
});
