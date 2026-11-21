import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pixelsOf, png } from '@pod/adapter-fs/testing';
import { fakeSdkFetch } from '@pod/adapter-http/testing';
import { printCheckDto } from '../../testing/batch-fixtures.js';
import {
  partsIn,
  savedDesign,
  settingsOf,
  storedPng,
  usePartsFolder,
} from '../testing/parts-setup.js';
import { createRotationService, pngRotator } from './rotation-providers.js';

/** Claude's advice to turn the artwork clockwise, with its reason. */
const turnClockwise = (reason: string) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: JSON.stringify({ turn: 'clockwise', reason }) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
});

/** A landscape print area, which portrait artwork is turned to fill. */
const landscapeBlanket = () =>
  Promise.resolve(
    printCheckDto({
      fit: 'cover',
      variants: [
        {
          id: '1',
          name: 'Blanket',
          color: null,
          size: null,
          areas: [{ placement: 'default', width: 192, height: 160, dpi: 150 }],
        },
      ],
      variantId: '1',
    }),
  );

describe('rotation providers', () => {
  const folder = usePartsFolder();

  it('turns portrait artwork for a landscape blanket, the reason asked in the window language', async () => {
    const claude = fakeSdkFetch(turnClockwise('Die Rehe sollen aufrecht stehen.'));
    const parts = await partsIn(folder, { fetch: claude.fetchFn });
    await parts.secrets.ai.anthropic.save({ apiKey: 'sk-ant-test' });
    const asset = await storedPng(parts, png(80, 96, 120), { width: 80, height: 96 });
    const design = await savedDesign(parts, '01-blanket', { asset });
    const rotation = createRotationService(parts, settingsOf(parts, 'de'), {
      checkPrint: landscapeBlanket,
    });

    const turned = await rotation.rotateDesign({ id: design.id });

    expect(turned).toMatchObject({ status: 'rotated', reason: 'Die Rehe sollen aufrecht stehen.' });
    expect(String(claude.sent[0]?.body['system'])).toContain('German (de)');
    const file = readFileSync(parts.assets.pathOf(turned.design.asset.storageKey));
    expect(pixelsOf(file)).toMatchObject({ width: 96, height: 80 });
    await rotation.close();
  });

  it('writes each turned PNG to a new file under the downloads folder', async () => {
    const parts = await partsIn(folder);
    const source = parts.assets.pathOf(
      (await storedPng(parts, png(6, 4, 50), { width: 6, height: 4 })).storageKey,
    );

    const turned = await pngRotator(parts).rotate(source, 90);

    try {
      expect(turned).toMatchObject({ width: 4, height: 6 });
      expect(turned.absolutePath.startsWith(parts.options.dataDirectory)).toBe(true);
      expect(turned.absolutePath).toMatch(/downloads[\\/][^\\/]+\.png$/);
    } finally {
      await turned.dispose();
    }
  });
});
