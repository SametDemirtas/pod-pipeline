import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, type SettingsDto } from '@pod/contracts';
import { ConnectionSecrets } from '../../application/connections/connection-secrets.js';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { MemorySecrets } from '../../testing/memory-secrets.js';
import { AI_DEFAULTS, aiCatalog } from './ai-catalog.js';
import { languageModels } from './language-models.js';
import { sceneGenerator } from './scene-generator.js';
import type { SharedParts } from '../shared-parts.js';

const noFetch: typeof fetch = () => Promise.reject(new Error('no requests in this test'));

/** The parts the AI composition reads, and settings a test changes between requests. */
function setup(change: Partial<SettingsDto> = {}) {
  let current = {
    language: 'en',
    textProvider: 'anthropic',
    textModel: 'claude-opus-5-5',
    checkModel: 'claude-haiku-5-5',
    sceneProvider: 'gemini',
    sceneModel: 'gemini-nano-banana-2.1',
    productFacts: {},
    aiDesigns: false,
    samsungFromIphone: true,
    upscaleModel: 'illustration',
    autoUpscale: false,
    listingPrices: {},
    shippingProfiles: {},
    sizePrices: {},
    listingSizes: {},
    ...change,
  } satisfies SettingsDto;
  const secrets = new ConnectionSecrets(new MemorySecrets());
  const parts: Pick<SharedParts, 'secrets' | 'fetch' | 'writeTemporary'> = {
    secrets,
    fetch: noFetch,
    writeTemporary: () => Promise.reject(new Error('nothing is written in this test')),
  };
  const settings: Pick<SettingsStore, 'get'> = { get: () => Promise.resolve(current) };
  return {
    parts,
    settings,
    secrets,
    choose: (next: Partial<SettingsDto>) => {
      current = { ...current, ...next };
    },
  };
}

const scene = {
  image: { absolutePath: '/photo.png', mimeType: 'image/png' as const },
  prompt: 'kitchen',
  shape: '4:3' as const,
};

describe('aiCatalog', () => {
  it('lists every service, with a check model that reads images', () => {
    const catalog = aiCatalog();

    expect(Object.keys(catalog)).toEqual([...AI_PROVIDERS]);
    expect(AI_PROVIDERS.map((provider) => catalog[provider].service)).toEqual([
      'Claude',
      'ChatGPT',
      'DeepSeek',
      'Kimi',
      'Gemini',
    ]);
    for (const provider of AI_PROVIDERS) {
      const { text } = catalog[provider];
      const readers = text.models.filter((model) => model.seesImages).map((model) => model.id);
      expect(readers).toContain(text.defaultCheckModel);
      expect(text.models.map((model) => model.id)).toContain(text.defaultModel);
    }
    expect(catalog.deepseek.text).toMatchObject({
      defaultCheckModel: 'deepseek-flash',
      othersSeeImages: false,
    });
  });

  it('offers scene models only for the services that make scenes', () => {
    const catalog = aiCatalog();

    expect(AI_PROVIDERS.filter((provider) => catalog[provider].scenes)).toEqual([
      'openai',
      'gemini',
    ]);
    expect(catalog.gemini.scenes?.defaultModel).toBe('gemini-nano-banana-2.1');
    expect(catalog.openai.scenes?.defaultModel).toBe('gpt-image-2.5-sunburst');
  });

  it('defaults to Claude for text and Gemini for scenes, with the models of each service', () => {
    expect(AI_DEFAULTS.textProvider).toBe('anthropic');
    expect(AI_DEFAULTS.sceneProvider).toBe('gemini');
    expect(AI_DEFAULTS.textModels('anthropic')).toEqual({
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
    });
    expect(AI_DEFAULTS.textModels('kimi')).toEqual({
      textModel: 'kimi-k3.1-pro',
      checkModel: 'kimi-k3.1-pro',
    });
    expect(AI_DEFAULTS.sceneModel('openai')).toBe('gpt-image-2.5-sunburst');
  });
});

describe('languageModels', () => {
  it('asks the text service chosen at the time of each request', async () => {
    const { parts, settings, secrets, choose } = setup();
    const models = languageModels(parts, settings, 'textModel');

    await expect(models.current()).rejects.toThrow(/Claude is not connected/);
    expect(await models.service()).toBe('Claude');

    choose({ textProvider: 'kimi', textModel: 'kimi-k3.1-pro' });
    await expect(models.current()).rejects.toThrow(/Kimi is not connected/);
    await secrets.ai.kimi.save({ apiKey: 'sk-kimi' });

    expect(await models.current()).toMatchObject({ service: 'Kimi', seesImages: true });
    expect(await models.service()).toBe('Kimi');

    choose({ textProvider: 'gemini', textModel: 'gemini-3.8-flash' });
    await expect(models.current()).rejects.toThrow(/Gemini is not connected/);
  });

  it('reads the setting it was made for, e.g. the model that checks scenes', async () => {
    const { parts, settings, secrets } = setup({
      textProvider: 'deepseek',
      textModel: 'deepseek-flash',
      checkModel: 'deepseek-v4-pro',
    });
    await secrets.ai.deepseek.save({ apiKey: 'sk-deepseek' });

    expect(await languageModels(parts, settings, 'textModel').current()).toMatchObject({
      seesImages: true,
    });
    expect(await languageModels(parts, settings, 'checkModel').current()).toMatchObject({
      seesImages: false,
    });
  });
});

describe('sceneGenerator', () => {
  it('makes each scene with the image service chosen at the time', async () => {
    const { parts, settings, choose } = setup();
    const generator = sceneGenerator(parts, settings);

    await expect(generator.generate(scene)).rejects.toThrow(/Gemini is not connected/);
    expect(await generator.service()).toBe('Gemini');

    choose({ sceneProvider: 'openai', sceneModel: 'gpt-image-2' });

    await expect(generator.generate(scene)).rejects.toThrow(/ChatGPT is not connected/);
    expect(await generator.service()).toBe('ChatGPT');
  });
});
