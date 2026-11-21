import { beforeEach, describe, expect, it } from 'vitest';
import type { AiProvider, ProductFactsDto, SceneProvider, UiLanguage } from '@pod/contracts';
import { productFamilyId } from '@pod/core';
import { MemoryPreferences } from '../../testing/memory-preferences.js';
import { SettingsPorts } from './settings-ports.js';
import { pickLanguage, SettingsStore } from './settings-store.js';

let preferences: MemoryPreferences;

beforeEach(() => {
  preferences = new MemoryPreferences();
});

describe('pickLanguage', () => {
  it.each([
    [['tr-TR', 'en-US'], 'tr'],
    [['de_AT'], 'de'],
    [['fr-FR', 'DE'], 'de'],
    [['fr-FR'], 'en'],
    [[], 'en'],
  ])('picks %j as %s', (locales, language) => {
    expect(pickLanguage(locales)).toBe(language);
  });
});

/** Model defaults named after their service, so a test sees which service they came from. */
const AI_DEFAULTS = {
  textProvider: 'anthropic',
  sceneProvider: 'gemini',
  textModels: (provider: AiProvider) => ({
    textModel: `${provider}-writer`,
    checkModel: `${provider}-checker`,
  }),
  sceneModel: (provider: SceneProvider) => `${provider}-scenes`,
} as const;
const DEFAULT_AI = {
  textProvider: 'anthropic',
  textModel: 'anthropic-writer',
  checkModel: 'anthropic-checker',
  sceneProvider: 'gemini',
  sceneModel: 'gemini-scenes',
} as const;
/** What the settings the seller has not touched read as, besides the AI services. */
const UNSET = {
  productFacts: {},
  aiDesigns: false,
  samsungFromIphone: true,
  upscaleModel: 'illustration',
  autoUpscale: false,
  listingPrices: {},
  shippingProfiles: {},
  sizePrices: {},
  listingSizes: { blanket: ['50″×60″'] },
} as const;

function settingsStore(
  language: UiLanguage = 'en',
  productFacts: Readonly<Record<string, ProductFactsDto>> = {},
): SettingsStore {
  return new SettingsStore(preferences, {
    language,
    productFacts,
    listingSizes: { blanket: ['50″×60″'] },
    ...AI_DEFAULTS,
  });
}

describe('SettingsStore', () => {
  it('returns defaults until something is saved, then persists updates', async () => {
    const store = settingsStore('tr');
    const changed = {
      language: 'de',
      textModel: 'claude-haiku-5-5',
      checkModel: 'claude-sonnet-5-5',
      sceneModel: 'gemini-other-image',
    } as const;

    expect(await store.get()).toEqual({ language: 'tr', ...DEFAULT_AI, ...UNSET });
    expect(await store.update(changed)).toEqual({ ...DEFAULT_AI, ...changed, ...UNSET });
    expect(await settingsStore('en').get()).toEqual({
      ...DEFAULT_AI,
      ...changed,
      ...UNSET,
    });
    expect(preferences.stored).toEqual(changed);
  });

  it('keeps each setting an update leaves out', async () => {
    const store = settingsStore();
    await store.update({
      language: 'tr',
      textProvider: 'openai',
      sceneModel: 'gemini-other-image',
    });

    expect(await store.update({})).toEqual({
      ...DEFAULT_AI,
      language: 'tr',
      textProvider: 'openai',
      textModel: 'openai-writer',
      checkModel: 'openai-checker',
      sceneModel: 'gemini-other-image',
      ...UNSET,
    });
  });

  it('goes back to the default model of the chosen service', async () => {
    const store = settingsStore();
    await store.update({ textProvider: 'kimi', sceneProvider: 'openai' });
    await store.update({ textModel: 'kimi-x', checkModel: 'kimi-y', sceneModel: 'gpt-image-x' });

    expect(await store.update({ textModel: null, checkModel: null, sceneModel: null })).toEqual({
      language: 'en',
      textProvider: 'kimi',
      textModel: 'kimi-writer',
      checkModel: 'kimi-checker',
      sceneProvider: 'openai',
      sceneModel: 'openai-scenes',
      ...UNSET,
    });
    expect(preferences.stored).toEqual({
      textProvider: 'kimi',
      sceneProvider: 'openai',
    });
  });

  it('starts a newly chosen service with its own default models', async () => {
    const store = settingsStore();
    await store.update({ textModel: 'claude-haiku-5-5', sceneModel: 'gemini-other-image' });

    expect(await store.update({ textProvider: 'deepseek' })).toMatchObject({
      textProvider: 'deepseek',
      textModel: 'deepseek-writer',
      checkModel: 'deepseek-checker',
      sceneModel: 'gemini-other-image',
    });
    expect(await store.update({ sceneProvider: 'openai' })).toMatchObject({
      textModel: 'deepseek-writer',
      sceneProvider: 'openai',
      sceneModel: 'openai-scenes',
    });
  });

  it('keeps the models when the same service is chosen again or a model comes with it', async () => {
    const store = settingsStore();
    await store.update({ textModel: 'claude-haiku-5-5' });

    expect((await store.update({ textProvider: 'anthropic' })).textModel).toBe('claude-haiku-5-5');
    expect(await store.update({ textProvider: 'gemini', checkModel: 'gemini-lite' })).toMatchObject(
      {
        textModel: 'gemini-writer',
        checkModel: 'gemini-lite',
      },
    );
  });

  it('reads the models stored before services could be chosen', async () => {
    preferences.stored = {
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
      sceneModel: 'gemini-nano-banana-2.1',
    };

    expect(await settingsStore().get()).toMatchObject({
      textProvider: 'anthropic',
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
      sceneProvider: 'gemini',
      sceneModel: 'gemini-nano-banana-2.1',
    });
  });

  it('reads the default models for a stored service without its own', async () => {
    preferences.stored = { textProvider: 'kimi' };

    expect(await settingsStore().get()).toMatchObject({
      textProvider: 'kimi',
      textModel: 'kimi-writer',
      checkModel: 'kimi-checker',
      sceneModel: 'gemini-scenes',
    });
  });
});

describe('SettingsStore product facts', () => {
  const mug = { material: 'Ceramic', care: 'Dishwasher safe', fit: '', size: '' };
  const shirt = { material: 'Cotton', care: '', fit: 'Unisex fit', size: '' };

  it('keeps the defaults of families the seller never changed', async () => {
    const store = settingsStore('en', { mug, 't-shirt': shirt });
    const ownMug = { ...mug, care: 'Hand wash' };

    await store.update({ productFacts: { mug: ownMug, poster: mug } });

    expect((await store.get()).productFacts).toEqual({ mug: ownMug, 't-shirt': shirt });
    const facts = new SettingsPorts(store);
    expect(await facts.factsFor(productFamilyId('mug'))).toEqual(ownMug);
    expect(await facts.factsFor(productFamilyId('poster'))).toEqual({
      material: '',
      care: '',
      fit: '',
      size: '',
    });
  });
});

describe('SettingsStore listing setup', () => {
  const usd = (amount: number) => ({ amount, currency: 'USD' });

  it('keeps the prices of families an update leaves out and removes those set to none', async () => {
    const store = settingsStore();
    await store.update({ listingPrices: { mug: usd(1899), blanket: usd(4999) } });

    expect(await store.update({ listingPrices: { mug: null, 'phone-case': usd(2199) } })).toEqual(
      expect.objectContaining({ listingPrices: { blanket: usd(4999), 'phone-case': usd(2199) } }),
    );
    expect((await settingsStore().get()).listingPrices).toEqual({
      blanket: usd(4999),
      'phone-case': usd(2199),
    });
  });

  it('keeps a shipping profile per family and goes back to the first for none', async () => {
    const store = settingsStore();
    await store.update({ shippingProfiles: { mug: '316', 'phone-case': '412' } });

    expect((await store.update({ shippingProfiles: { mug: null } })).shippingProfiles).toEqual({
      'phone-case': '412',
    });
    expect((await settingsStore().get()).shippingProfiles).toEqual({ 'phone-case': '412' });
  });

  it('keeps prices by size and the sizes listed, going back to the default sizes', async () => {
    const store = settingsStore();
    const sizes = { '60″×80″': { amount: 7499, currency: 'USD' } };

    const saved = await store.update({
      sizePrices: { blanket: sizes },
      listingSizes: { blanket: ['50″×60″', '60″×80″'], mug: ['15 oz'] },
    });
    expect(saved).toMatchObject({
      sizePrices: { blanket: sizes },
      listingSizes: { blanket: ['50″×60″', '60″×80″'], mug: ['15 oz'] },
    });
    expect(
      await store.update({ sizePrices: { blanket: null }, listingSizes: { blanket: null } }),
    ).toMatchObject({ sizePrices: {}, listingSizes: { blanket: ['50″×60″'], mug: ['15 oz'] } });
  });

  it('remembers that designs are made with AI tools until the seller says otherwise', async () => {
    const store = settingsStore();

    expect((await store.update({ aiDesigns: true })).aiDesigns).toBe(true);
    expect((await store.update({ language: 'de' })).aiDesigns).toBe(true);
    expect(await new SettingsPorts(store).designsMadeWithAi()).toBe(true);
    expect(await new SettingsPorts(store).shared()).toBe(true);
    await store.update({ samsungFromIphone: false });
    expect(await new SettingsPorts(store).shared()).toBe(false);
    expect((await store.update({ aiDesigns: false })).aiDesigns).toBe(false);
  });

  it('remembers the upscaling model and whether prepared listings upscale', async () => {
    const store = settingsStore();

    await store.update({ upscaleModel: 'photo', autoUpscale: true });

    expect(await settingsStore().get()).toMatchObject({ upscaleModel: 'photo', autoUpscale: true });
  });
});
