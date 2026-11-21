import { describe, expect, it } from 'vitest';
import type { PreviewImage, RotationQuestion } from '@pod/core';
import { AiRotationAdvisor } from './ai-rotation-advisor.js';
import { FakeJsonModel, jsonAnswer } from './testing/fake-json-model.js';

const artwork: PreviewImage = { data: new Uint8Array([1, 2]), mimeType: 'image/jpeg' };
const question: RotationQuestion = {
  artwork,
  artworkOrientation: 'portrait',
  areaOrientation: 'landscape',
  product: 'blanket',
};

const advisor = (model: FakeJsonModel) => new AiRotationAdvisor(model, () => Promise.resolve('de'));

describe('AiRotationAdvisor', () => {
  it('shows the model the artwork and what it goes on, and reads the turn', async () => {
    const model = new FakeJsonModel(
      jsonAnswer({ turn: 'clockwise', reason: ' Das Reh muss aufrecht stehen. ' }),
    );

    expect(await advisor(model).advise(question)).toEqual({
      degrees: 90,
      reason: 'Das Reh muss aufrecht stehen.',
    });

    const [asked] = model.questions;
    expect(asked).toMatchObject({ effort: 'low' });
    expect(asked?.parts).toEqual([
      { text: 'The artwork:' },
      { image: artwork },
      {
        text: 'The artwork is portrait; the print area of the blanket is landscape. Which way should the artwork be turned?',
      },
    ]);
    expect(asked?.system).toContain('Write "reason" as one short sentence in German (de)');
    expect(asked?.system).toContain('a seamless or repeating pattern');
  });

  it.each([
    ['counterclockwise', 270],
    ['none', 0],
  ] as const)('reads %s as %i degrees', async (turn, degrees) => {
    const model = new FakeJsonModel(jsonAnswer({ turn, reason: 'Why.' }));

    expect((await advisor(model).advise(question)).degrees).toBe(degrees);
  });

  it.each([
    ['an unknown turn', { turn: 'upside down', reason: 'Why.' }],
    ['no reason', { turn: 'none' }],
    ['an empty reason', { turn: 'none', reason: ' ' }],
  ])('reports %s', async (_case, answer) => {
    await expect(advisor(new FakeJsonModel(jsonAnswer(answer))).advise(question)).rejects.toThrow(
      'Fake sent turn advice in an unexpected shape',
    );
  });

  it('refuses a chosen model that cannot read images, before asking it', async () => {
    const model = new FakeJsonModel(jsonAnswer({}), false, 'DeepSeek');

    await expect(advisor(model).advise(question)).rejects.toMatchObject({
      name: 'AiAnswerError',
      message: "DeepSeek's chosen model cannot read images; choose one that does",
    });
    expect(model.questions).toEqual([]);
  });
});
