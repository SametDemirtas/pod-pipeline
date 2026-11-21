import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { TemporaryFile } from '@pod/core';
import { checkGeminiKey } from './check-key.js';
import { GEMINI_FAILURES } from './classify-error.js';
import { GeminiSceneUnfinishedError } from './errors.js';
import { GeminiSceneGenerator } from './gemini-scene-generator.js';
import { fakeGemini, type Reply } from './testing/fake-gemini.js';

const folder = mkdtempSync(join(tmpdir(), 'gemini-'));
const photo = join(folder, 'mug.png');
writeFileSync(photo, 'png bytes');
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

const imageStep = (data: string, mime_type = 'image/png') => ({
  type: 'model_output',
  content: [
    { type: 'text', text: 'Here is your scene.' },
    { type: 'image', mime_type, data },
  ],
});

function generatorWith(fetchFn: typeof fetch, key: string | null = 'gk') {
  const written: { bytes: string; mimeType: string }[] = [];
  let time = 0;
  const generator = new GeminiSceneGenerator({
    apiKey: () => Promise.resolve(key ?? undefined),
    model: () => Promise.resolve('gemini-test-image'),
    fetch: fetchFn,
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    now: () => time,
    writeTemporary: (bytes, mimeType): Promise<TemporaryFile> => {
      written.push({ bytes: Buffer.from(bytes).toString(), mimeType });
      return Promise.resolve({
        absolutePath: `/tmp/${written.length}`,
        dispose: () => Promise.resolve(),
      });
    },
  });
  return { generator, written };
}

const request = {
  image: { absolutePath: photo, mimeType: 'image/png' },
  prompt: 'on a table',
  shape: '4:3',
} as const;

describe('GeminiSceneGenerator', () => {
  it('sends the photo first, then the prompt, to the chosen model and keeps the last image', async () => {
    const { sent, fetchFn } = fakeGemini({
      body: {
        id: 'i1',
        status: 'completed',
        steps: [
          imageStep(Buffer.from('draft').toString('base64')),
          imageStep(Buffer.from('scene').toString('base64')),
        ],
      },
    });
    const { generator, written } = generatorWith(fetchFn);

    const file = await generator.generate(request);

    expect(file.absolutePath).toBe('/tmp/1');
    expect(written).toEqual([{ bytes: 'scene', mimeType: 'image/png' }]);
    expect(sent[0]).toMatchObject({
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      method: 'POST',
      headers: { 'x-goog-api-key': 'gk' },
      body: {
        model: 'gemini-test-image',
        input: [
          {
            type: 'image',
            mime_type: 'image/png',
            data: Buffer.from('png bytes').toString('base64'),
          },
          { type: 'text', text: 'on a table' },
        ],
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '4:3',
          image_size: '4K',
        },
        background: true,
      },
    });
  });

  it.each(['1:1', '3:4'] as const)('asks for a %s scene in 4K', async (shape) => {
    const { sent, fetchFn } = fakeGemini({
      body: { id: 'i1', status: 'completed', steps: [imageStep('c2NlbmU=')] },
    });

    await generatorWith(fetchFn).generator.generate({ ...request, shape });

    expect(sent[0]?.body).toMatchObject({
      response_format: { aspect_ratio: shape, image_size: '4K' },
    });
  });

  it('takes an image without a type to be the JPEG it asked for', async () => {
    const { fetchFn } = fakeGemini({
      body: {
        id: 'i1',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'image', data: 'c2NlbmU=' }] }],
      },
    });
    const { generator, written } = generatorWith(fetchFn);

    await generator.generate(request);

    expect(written).toEqual([{ bytes: 'scene', mimeType: 'image/jpeg' }]);
  });

  it('waits for an interaction still in progress', async () => {
    const { sent, fetchFn } = fakeGemini(
      { body: { id: 'i/1', status: 'in_progress', steps: [] } },
      { body: { id: 'i/1', status: 'in_progress', steps: [] } },
      { body: { id: 'i/1', status: 'completed', steps: [imageStep('c2NlbmU=', 'image/jpeg')] } },
    );
    const { generator, written } = generatorWith(fetchFn);

    await generator.generate(request);

    expect(sent.slice(1).map((call) => [call.method, call.url])).toEqual(
      Array(2).fill(['GET', 'https://generativelanguage.googleapis.com/v1beta/interactions/i%2F1']),
    );
    expect(written[0]?.mimeType).toBe('image/jpeg');
  });

  it.each([
    [
      'a failed interaction',
      [{ body: { status: 'failed', errors: [{ code: 'x', message: 'blocked by safety' }] } }],
      'Gemini failed: blocked by safety',
    ],
    [
      'a stopped interaction',
      [{ body: { status: 'cancelled' } }],
      'Gemini stopped (cancelled): no reason given',
    ],
    [
      'an answer without an image',
      [{ body: { status: 'completed', steps: [{ type: 'model_output', content: [] }] } }],
      /without an image$/,
    ],
    [
      'what Gemini wrote instead of an image',
      [
        {
          body: {
            status: 'completed',
            steps: [
              { type: 'model_output', content: [{ type: 'text', text: 'I cannot draw logos.' }] },
            ],
          },
        },
      ],
      'Gemini answered without an image: I cannot draw logos.',
    ],
    [
      'a pending interaction without an id, as of unknown outcome',
      [{ body: { status: 'in_progress' } }],
      'did not finish the scene: no readable answer',
    ],
    [
      'an error status',
      [{ status: 429, body: { error: { code: 429, message: 'Resource exhausted' } } }],
      'Gemini returned 429: Resource exhausted',
    ],
  ])('reports %s', async (_case, replies, message: string | RegExp) => {
    const { fetchFn } = fakeGemini(...replies);

    await expect(generatorWith(fetchFn).generator.generate(request)).rejects.toThrow(message);
  });

  it('gives up on an interaction that never finishes, asking Google to stop it', async () => {
    const pending = { body: { id: 'i1', status: 'in_progress' } };
    const { sent, fetchFn } = fakeGemini(...Array.from({ length: 200 }, () => pending));

    await expect(generatorWith(fetchFn).generator.generate(request)).rejects.toBeInstanceOf(
      GeminiSceneUnfinishedError,
    );
    expect(sent.at(-1)).toMatchObject({
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions/i1/cancel',
      method: 'POST',
    });
  });

  it('still reports the outcome unknown when stopping the scene fails', async () => {
    const pending = { body: { id: 'i1', status: 'in_progress' } };
    const polls = Array.from({ length: 91 }, () => pending);
    const { sent, fetchFn } = fakeGemini(...polls, { status: 500, body: {} });

    const error = await generatorWith(fetchFn)
      .generator.generate(request)
      .catch((e: unknown) => e);

    expect(sent.at(-1)).toMatchObject({ url: expect.stringMatching(/\/cancel$/) as unknown });
    expect(sent).toHaveLength(polls.length + 1);
    expect(GEMINI_FAILURES.classify(error)).toMatchObject({ kind: 'interrupted' });
  });

  it.each([500, 502, 504])(
    'leaves the outcome unknown when starting the scene ends in %i',
    async (status) => {
      const { sent, fetchFn } = fakeGemini({ status, body: { error: { message: 'Internal' } } });

      const error = await generatorWith(fetchFn)
        .generator.generate(request)
        .catch((e: unknown) => e);

      expect(GEMINI_FAILURES.classify(error)).toEqual({
        kind: 'interrupted',
        service: 'Gemini',
        reason: 'no answer',
      });
      expect(sent).toHaveLength(1);
    },
  );

  it("asks again when a poll fails on the network, on a rate limit or on Google's side", async () => {
    const done = { body: { id: 'i1', status: 'completed', steps: [imageStep('c2NlbmU=')] } };
    const pending = { body: { id: 'i1', status: 'in_progress' } };
    const { sent, fetchFn } = fakeGemini(
      pending,
      { offline: true },
      { status: 503, body: { error: { message: 'Unavailable' } } },
      pending,
      { status: 429, body: { error: { message: 'Resource exhausted' } } },
      done,
    );
    const { generator, written } = generatorWith(fetchFn);

    await generator.generate(request);

    expect(sent).toHaveLength(6);
    expect(written).toEqual([{ bytes: 'scene', mimeType: 'image/png' }]);
  });

  it.each([
    [
      'three failed polls in a row',
      [{ offline: true }, { status: 500, body: {} }, { status: 502, body: {} }],
    ],
    ['three overloaded polls', Array.from({ length: 3 }, () => ({ status: 503, body: {} }))],
  ] as [string, Reply[]][])(
    'leaves the outcome unknown after %s, as the scene may be billed',
    async (_case, polls) => {
      const { sent, fetchFn } = fakeGemini({ body: { id: 'i1', status: 'in_progress' } }, ...polls);

      const error = await generatorWith(fetchFn)
        .generator.generate(request)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GeminiSceneUnfinishedError);
      expect(GEMINI_FAILURES.classify(error)).toEqual({
        kind: 'interrupted',
        service: 'Gemini',
        reason: 'no answer',
      });
      expect(sent).toHaveLength(1 + polls.length);
    },
  );

  it('gives up on a poll Google refuses', async () => {
    const { fetchFn } = fakeGemini(
      { body: { id: 'i1', status: 'in_progress' } },
      { status: 404, body: { error: { message: 'Gone' } } },
    );

    await expect(generatorWith(fetchFn).generator.generate(request)).rejects.toThrow(/404/);
  });

  it('leaves the outcome unknown when the answer to starting the scene cannot be read', async () => {
    const { fetchFn } = fakeGemini({ body: 'not json at all' });

    const error = await generatorWith(fetchFn)
      .generator.generate(request)
      .catch((e: unknown) => e);

    expect(GEMINI_FAILURES.classify(error)).toMatchObject({ kind: 'interrupted' });
  });

  it('leaves the outcome unknown when a poll cannot be read', async () => {
    const { fetchFn } = fakeGemini(
      { body: { id: 'i1', status: 'in_progress' } },
      { body: 'not json at all' },
    );

    const error = await generatorWith(fetchFn)
      .generator.generate(request)
      .catch((e: unknown) => e);

    expect(GEMINI_FAILURES.classify(error)).toEqual({
      kind: 'interrupted',
      service: 'Gemini',
      reason: 'no readable answer',
    });
  });

  it('says when no key is saved', async () => {
    const { fetchFn, sent } = fakeGemini();

    await expect(generatorWith(fetchFn, null).generator.generate(request)).rejects.toThrow(
      /not connected/,
    );
    expect(sent).toEqual([]);
  });
});

describe('checkGeminiKey', () => {
  it('lists one model with the key, and reports a refused key', async () => {
    const ok = fakeGemini({ body: { models: [] } });
    const refused = fakeGemini({
      status: 400,
      body: {
        error: {
          message: 'API key not valid',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
          ],
        },
      },
    });

    await checkGeminiKey('gk', ok.fetchFn);
    expect(ok.sent[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
    );
    await expect(checkGeminiKey('bad', refused.fetchFn)).rejects.toMatchObject({
      status: 400,
      reason: 'API_KEY_INVALID',
      message: 'Gemini returned 400: API key not valid',
    });
  });

  it('uses the status text when an error has no JSON body', async () => {
    const fetchFn: typeof fetch = () =>
      Promise.resolve(new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }));

    await expect(checkGeminiKey('gk', fetchFn)).rejects.toThrow('Gemini returned 502: Bad Gateway');
  });
});
