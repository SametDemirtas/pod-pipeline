import { describe, expect, it } from 'vitest';
import type { PreviewImage } from '@pod/core';
import { AiSceneInspector } from './ai-scene-inspector.js';
import { FakeJsonModel, jsonAnswer } from './testing/fake-json-model.js';

const original: PreviewImage = { data: new Uint8Array([1, 2]), mimeType: 'image/jpeg' };
const scene: PreviewImage = { data: new Uint8Array([3, 4]), mimeType: 'image/jpeg' };

const inspector = (model: FakeJsonModel) =>
  new AiSceneInspector(model, () => Promise.resolve('tr'));

describe('AiSceneInspector', () => {
  it('shows the model the original, then the scene, and reads its verdict', async () => {
    const verdict = {
      same: false,
      issues: ["2: 'COFFEE' became 'COFFE'"],
      unverifiable: ['4: the handle hides the left edge'],
    };
    const model = new FakeJsonModel(jsonAnswer(verdict));

    expect(await inspector(model).compare(original, scene)).toEqual(verdict);

    const [question] = model.questions;
    expect(question).toMatchObject({ effort: 'medium' });
    expect(question?.parts).toEqual([
      { text: 'Image 1, the original:' },
      { image: original },
      { text: 'Image 2, the generated scene:' },
      { image: scene },
      { text: 'Compare the product and its print in the two images.' },
    ]);
    const system = question?.system ?? '';
    expect(system).toContain('read every word in both images letter by letter');
    expect(system).toContain('"same" is true only when items 1 to 6 have no issues');
    expect(system).toContain('Write them in Turkish (tr)');
    expect(system).toContain('Ignore them, except where items 4, 6 and 7 say otherwise.');
    expect(system).toContain('not a warmer, cooler, lighter or darker shade');
    expect(system).toContain('that is an issue under item 4');
    expect(system).toContain('flag a cut-out look');
    expect(system).toContain(
      'a person wearing or holding the product are styles a scene may ask for',
    );
  });

  it.each([
    ['a verdict without issues', { same: true, unverifiable: [] }],
    ['a verdict without doubts', { same: true, issues: [] }],
    ['issues that are not text', { same: true, issues: [1], unverifiable: [] }],
    ['no verdict', { issues: [], unverifiable: [] }],
  ])('reports %s', async (_case, answer) => {
    await expect(
      inspector(new FakeJsonModel(jsonAnswer(answer))).compare(original, scene),
    ).rejects.toThrow('Fake sent a scene check in an unexpected shape');
  });

  it('refuses a chosen model that cannot read images, before asking it', async () => {
    const model = new FakeJsonModel(jsonAnswer({}), false, 'DeepSeek');

    await expect(inspector(model).compare(original, scene)).rejects.toMatchObject({
      name: 'AiAnswerError',
      service: 'DeepSeek',
      message: "DeepSeek's chosen model cannot read images; choose one that does",
    });
    expect(model.questions).toEqual([]);
  });
});
