import { describe, expect, it } from 'vitest';
import { answerOf, type Expected } from './answers.js';
import type { JsonAnswer } from './json-model.js';
import { FakeJsonModel } from './testing/fake-json-model.js';

const question = { system: 'S', parts: [{ text: 'Q' }], effort: 'low', schema: {} } as const;

const COUNT: Expected<number> = {
  subject: 'count',
  item: 'a count',
  read: ({ count }) => (typeof count === 'number' ? count : undefined),
};

const answering = (answer: JsonAnswer, expected: Expected<number> = COUNT) =>
  answerOf(new FakeJsonModel(answer, true, 'Claude'), question, expected);

describe('answerOf', () => {
  it('asks the question and reads the answer', async () => {
    const model = new FakeJsonModel({ kind: 'text', text: '{"count":3}' }, true, 'Claude');

    expect(await answerOf(model, question, COUNT)).toBe(3);
    expect(model.questions).toEqual([question]);
  });

  it('reads JSON wrapped in a Markdown code fence', async () => {
    expect(await answering({ kind: 'text', text: '```json\n{"count":4}\n```' })).toBe(4);
    expect(await answering({ kind: 'text', text: '```\n{"count":5}\n```' })).toBe(5);
  });

  it.each([
    ['a refusal', { kind: 'refused' }, 'Claude declined to write the count'],
    ['a cut-off answer', { kind: 'cut-off' }, 'Claude ran out of room before finishing the count'],
    ['no text at all', { kind: 'text', text: undefined }, 'Claude sent no count'],
    [
      'text that is not JSON',
      { kind: 'text', text: 'Here you go' },
      'Claude sent count that is not JSON',
    ],
    [
      'the wrong shape',
      { kind: 'text', text: '{"count":"3"}' },
      'Claude sent a count in an unexpected shape',
    ],
    [
      'JSON that is no object',
      { kind: 'text', text: 'null' },
      'Claude sent a count in an unexpected shape',
    ],
  ] satisfies [string, JsonAnswer, string][])(
    'reports %s, naming the service',
    async (_case, answer, message) => {
      await expect(answering(answer)).rejects.toMatchObject({
        name: 'AiAnswerError',
        service: 'Claude',
        message,
      });
    },
  );

  it('reads a JSON array as no object, whatever fields an array has', async () => {
    const length: Expected<number> = {
      subject: 'count',
      item: 'a count',
      read: ({ length: value }) => (typeof value === 'number' ? value : undefined),
    };

    await expect(answering({ kind: 'text', text: '[1,2]' }, length)).rejects.toThrow(
      'Claude sent a count in an unexpected shape',
    );
  });

  it('names an uncountable subject without an article', async () => {
    await expect(
      answering({ kind: 'text', text: '{}' }, { subject: 'listing text', read: () => undefined }),
    ).rejects.toThrow('Claude sent listing text in an unexpected shape');
  });
});
