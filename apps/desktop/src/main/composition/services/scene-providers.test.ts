import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { png } from '@pod/adapter-fs/testing';
import { fakeSdkFetch } from '@pod/adapter-http/testing';
import type { Mockup, MockupId } from '@pod/core';
import { photo } from '../../testing/mockup-fixtures.js';
import {
  partsIn,
  savedDesign,
  settingsOf,
  storedPng,
  usePartsFolder,
} from '../testing/parts-setup.js';
import type { ServiceOptions } from '../shared-parts.js';
import { createPhotoService, createSceneService } from './scene-providers.js';

/** A finished Claude answer holding `answer` as its JSON text. */
const claudeSays = (answer: unknown) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: JSON.stringify(answer) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('scene providers', () => {
  const folder = usePartsFolder();

  /** A mug design with one scene made from a stored photo, and Claude connected. */
  async function sceneOfMug(overrides: Partial<ServiceOptions> = {}) {
    const parts = await partsIn(folder, overrides);
    await parts.secrets.ai.anthropic.save({ apiKey: 'sk-ant-test' });
    const design = await savedDesign(parts, '01-mug');
    const asset = await storedPng(parts, png(40, 30, 90), { width: 40, height: 30 });
    const scene: Mockup = {
      ...photo,
      id: 'scene-1' as MockupId,
      designId: design.id,
      view: 'Tulip kitchen',
      scenePrompt: 'a mug on a kitchen table at Maple Lane',
      sourceAsset: asset,
      asset,
    };
    await parts.mockups.add([scene]);
    return { parts, design, scene };
  }

  it('asks for the scene check in the language the window shows', async () => {
    const claude = fakeSdkFetch(claudeSays({ same: true, issues: [], unverifiable: [] }));
    const { parts, design, scene } = await sceneOfMug({ fetch: claude.fetchFn });
    const scenes = createSceneService(parts, settingsOf(parts, 'de'));

    const checked = await scenes.checkSceneAgain({ designId: design.id, mockupId: scene.id });

    expect(checked.sceneCheck).toMatchObject({ same: true });
    expect(claude.sent).toHaveLength(1);
    expect(String(claude.sent[0]?.body['system'])).toContain('German (de)');
  });

  it('reads a dropped reference photo from a temporary file it removes again', async () => {
    const claude = fakeSdkFetch(
      claudeSays({ description: 'A sunny Lantern Harbor porch', visible_words: [] }),
    );
    const { parts, design } = await sceneOfMug({ fetch: claude.fetchFn });
    const scenes = createSceneService(parts, settingsOf(parts, 'en'));
    const dropped = Buffer.from(png(12, 8, 30)).toString('base64');

    const style = await scenes.describeSceneStyle({ designId: design.id, image: dropped });

    expect(style).toMatchObject({ description: 'A sunny Lantern Harbor porch' });
    expect(JSON.stringify(claude.sent[0]?.body['messages'])).toContain(dropped);
    const downloads = join(parts.options.dataDirectory, 'downloads');
    expect(existsSync(downloads) ? readdirSync(downloads) : []).toEqual([]);
  });

  it('copies a stored photo to the place the seller chooses', async () => {
    const target = () => join(folder.dir, 'meadow-bees.png');
    const { parts, design, scene } = await sceneOfMug({
      pickSavePath: () => Promise.resolve(target()),
    });

    const saved = await createPhotoService(parts).savePhoto({
      designId: design.id,
      mockupId: scene.id,
    });

    expect(saved).toBe(true);
    expect(readFileSync(target())).toEqual(
      readFileSync(parts.assets.pathOf(scene.asset.storageKey)),
    );
  });
});
