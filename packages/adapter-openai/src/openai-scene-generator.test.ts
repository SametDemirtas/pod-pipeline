import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { TemporaryFile } from '@pod/core';
import { OPENAI_COMPATIBLE_FAILURES } from './classify-error.js';
import { OpenAiSceneGenerator } from './openai-scene-generator.js';
import { OPENAI_SCENE_MODELS } from './scene-models.js';
import { apiError, fakeOpenAi } from './testing/fake-openai.js';

const folder = mkdtempSync(join(tmpdir(), 'openai-'));
const photo = join(folder, 'mug.png');
writeFileSync(photo, 'png bytes');
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

function generatorWith(fetchFn: typeof fetch, key: string | null = 'sk') {
  const written: { bytes: string; mimeType: string }[] = [];
  const generator = new OpenAiSceneGenerator({
    apiKey: () => Promise.resolve(key ?? undefined),
    model: () => Promise.resolve('gpt-image-2.5-sunburst'),
    fetch: fetchFn,
    writeTemporary: (bytes, mimeType): Promise<TemporaryFile> => {
      written.push({ bytes: Buffer.from(bytes).toString(), mimeType });
      return Promise.resolve({ absolutePath: '/tmp/1', dispose: () => Promise.resolve() });
    },
  });
  return { generator, written };
}

const request = {
  image: { absolutePath: photo, mimeType: 'image/png' },
  prompt: 'on a table',
  shape: '4:3',
} as const;
const scene = { created: 0, data: [{ b64_json: Buffer.from('scene').toString('base64') }] };

describe('OpenAiSceneGenerator', () => {
  it('edits the product photo into a 4:3 JPEG scene with the chosen model', async () => {
    const { sent, fetchFn } = fakeOpenAi(scene);
    const { generator, written } = generatorWith(fetchFn);

    const file = await generator.generate(request);

    expect(file.absolutePath).toBe('/tmp/1');
    expect(written).toEqual([{ bytes: 'scene', mimeType: 'image/jpeg' }]);
    const [edit] = sent;
    expect(edit?.url).toBe('https://api.openai.com/v1/images/edits');
    expect(edit?.headers.get('authorization')).toBe('Bearer sk');
    expect(edit?.body).toMatchObject({
      model: 'gpt-image-2.5-sunburst',
      prompt: 'on a table',
      quality: 'high',
      output_format: 'jpeg',
      size: '2048x1536',
    });
    expect(edit?.body).not.toHaveProperty('input_fidelity');
    const image = edit?.body['image'] as File;
    expect([image.name, image.type, await image.text()]).toEqual([
      'mug.png',
      'image/png',
      'png bytes',
    ]);
  });

  it.each([
    ['1:1', '1920x1920'],
    ['3:4', '1536x2048'],
  ] as const)('asks for a %s scene as %s', async (shape, size) => {
    const { sent, fetchFn } = fakeOpenAi(scene);

    await generatorWith(fetchFn).generator.generate({ ...request, shape });

    expect(sent[0]?.body).toMatchObject({ size });
  });

  it('reports an answer without an image', async () => {
    const { generator } = generatorWith(fakeOpenAi({ created: 0, data: [] }).fetchFn);

    await expect(generator.generate(request)).rejects.toMatchObject({
      service: 'ChatGPT',
      message: 'ChatGPT returned no image',
    });
  });

  it('does not ask again after a failure, since a scene may already be billed', async () => {
    const { sent, fetchFn } = fakeOpenAi(apiError('Server error', 'server_error'), 500);

    await expect(generatorWith(fetchFn).generator.generate(request)).rejects.toMatchObject({
      name: 'OpenAiSceneUnfinishedError',
      service: 'ChatGPT',
    });
    expect(sent).toHaveLength(1);
  });

  it.each([500, 502, 504])(
    'leaves the outcome unknown after %i, as the scene may have been made',
    async (status) => {
      const { fetchFn } = fakeOpenAi(apiError('Server error', 'server_error'), status);

      const error = await generatorWith(fetchFn)
        .generator.generate(request)
        .catch((e: unknown) => e);

      expect(OPENAI_COMPATIBLE_FAILURES.classify(error)).toEqual({
        kind: 'interrupted',
        service: 'ChatGPT',
        reason: 'no answer',
      });
    },
  );

  it('reports a refused scene as failed', async () => {
    const { fetchFn } = fakeOpenAi(apiError('Prompt refused', 'moderation_blocked'), 400);

    const error = await generatorWith(fetchFn)
      .generator.generate(request)
      .catch((e: unknown) => e);

    expect(OPENAI_COMPATIBLE_FAILURES.classify(error)).toMatchObject({ kind: 'failed' });
  });

  it('suggests only models that take custom sizes, with its default among them', () => {
    expect(OPENAI_SCENE_MODELS.models.map((model) => model.id)).toEqual([
      'gpt-image-2.5-sunburst',
      'gpt-image-2.5-flare',
      'gpt-image-2',
    ]);
    expect(OPENAI_SCENE_MODELS.defaultModel).toBe('gpt-image-2.5-sunburst');
  });

  it('says when no key is saved', async () => {
    const { fetchFn, sent } = fakeOpenAi(scene);

    await expect(generatorWith(fetchFn, null).generator.generate(request)).rejects.toThrow(
      'ChatGPT is not connected; add an OpenAI API key first',
    );
    expect(sent).toEqual([]);
  });
});
