import { describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import { betterScene } from './better-scene.js';
import type { Mockup, MockupId, SceneCheck } from '../mockup.js';

const scene = (id: string, sceneCheck: SceneCheck | null): Mockup => ({
  id: id as MockupId,
  designId: 'design-01-mug' as DesignId,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: 'Scene',
  scenePrompt: 'on a table',
  sceneCheck,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: id,
    storageKey: `ab/${id}`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 1,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
});

const check = (same: boolean, issues: number): SceneCheck => ({
  same,
  issues: Array.from({ length: issues }, (_, index) => `7: flaw ${index}`),
  unverifiable: [],
});

describe('betterScene', () => {
  it.each([
    ['an unchanged print over a changed one', check(false, 0), check(true, 2), 'b'],
    ['an unchanged print, whichever comes first', check(true, 3), check(false, 1), 'a'],
    ['fewer issues when both prints match', check(true, 2), check(true, 1), 'b'],
    ['fewer issues when both prints changed', check(false, 1), check(false, 2), 'a'],
    ['the first on a tie', check(true, 1), check(true, 1), 'a'],
  ])('prefers %s', (_case, first, second, winner) => {
    expect(betterScene(scene('a', first), scene('b', second))?.id).toBe(winner);
  });

  it('cannot tell while either scene is unchecked', () => {
    expect(betterScene(scene('a', null), scene('b', check(true, 0)))).toBeUndefined();
    expect(betterScene(scene('a', check(true, 0)), scene('b', null))).toBeUndefined();
  });
});
