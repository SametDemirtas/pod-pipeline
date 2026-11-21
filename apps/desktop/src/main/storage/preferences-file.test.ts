import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describePreferencesStoreContract } from '../testing/preferences-store-contract.js';
import { PreferencesFile } from './preferences-file.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-preferences-'));
  file = join(dir, 'settings.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describePreferencesStoreContract('PreferencesFile', () => ({
  store: new PreferencesFile(file),
  seed: (raw) => {
    writeFileSync(file, JSON.stringify(raw));
  },
}));

describe('PreferencesFile', () => {
  it('reads a file that is not JSON as empty', async () => {
    writeFileSync(file, 'not json');

    expect(await new PreferencesFile(file).read()).toEqual({});
  });

  it('reports a file it cannot read instead of overwriting it', async () => {
    mkdirSync(file);
    const preferences = new PreferencesFile(file);

    await expect(preferences.read()).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(preferences.change(() => ({ language: 'de' }))).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it.each([
    [
      'malformed models',
      { textProvider: 'kimi', textModel: 'Kimi K3!', sceneModel: '' },
      { textProvider: 'kimi' },
    ],
    [
      'choices and prices in the wrong shape',
      {
        productFacts: { mug: { material: 1 } },
        upscaleModel: 'anime',
        autoUpscale: 'yes',
        aiDesigns: 'yes',
        listingPrices: { mug: { amount: 0 } },
      },
      {},
    ],
  ])('drops %s', async (_case, stored, read) => {
    writeFileSync(file, JSON.stringify(stored));

    expect(await new PreferencesFile(file).read()).toEqual(read);
  });

  it('keeps models stored before services could be chosen', async () => {
    const models = {
      textModel: 'claude-opus-5-5',
      checkModel: 'claude-haiku-5-5',
      sceneModel: 'gemini-nano-banana-2.1',
    };
    writeFileSync(file, JSON.stringify(models));

    expect(await new PreferencesFile(file).read()).toEqual(models);
  });
});

describe('PreferencesFile after a failed change', () => {
  it('reports the failure and still applies later changes', async () => {
    const nested = join(dir, 'later', 'settings.json');
    const preferences = new PreferencesFile(nested);

    await expect(preferences.change(() => ({ language: 'de' }))).rejects.toThrow(/ENOENT/);
    mkdirSync(join(dir, 'later'));
    await preferences.change(() => ({ language: 'tr' }));

    expect(await preferences.read()).toEqual({ language: 'tr' });
  });
});
