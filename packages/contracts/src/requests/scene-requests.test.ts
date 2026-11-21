import { describe, expect, it } from 'vitest';
import { SCENE_LOOK_OPTIONS } from '../dto/scene-look.js';
import { fields } from '../fields.js';
import { createSceneRequest, previewSceneLookRequest } from './index.js';

describe('scene looks', () => {
  const scene = { designId: 'd', mockupId: 'm', prompt: 'On a desk', candidates: 1 } as const;

  it('take a shape and any of the known options, leaving the others at Auto', () => {
    const look = { shape: '3:4', lighting: 'moody', cameraHeight: 'topDown' } as const;

    expect(createSceneRequest.parse({ ...scene, look }).look).toEqual(look);
    expect(previewSceneLookRequest.parse({ familyId: 'mug', look: { shape: '1:1' } })).toEqual({
      familyId: 'mug',
      look: { shape: '1:1' },
    });
  });

  it('cover every look control', () => {
    expect(Object.keys(fields.sceneLook.shape)).toEqual([
      'shape',
      ...Object.keys(SCENE_LOOK_OPTIONS),
    ]);
  });

  it.each([
    ['no look', undefined],
    ['no shape', { lighting: 'moody' }],
    ['an unknown shape', { shape: '16:9' }],
    ['an unknown option', { shape: '4:3', lighting: 'neon' }],
    ['an option of another control', { shape: '4:3', lighting: 'hero' }],
    ['an unknown control', { shape: '4:3', lens: 'macro' }],
  ])('refuse %s', (_case, look) => {
    expect(createSceneRequest.safeParse({ ...scene, look }).success).toBe(false);
  });
});
