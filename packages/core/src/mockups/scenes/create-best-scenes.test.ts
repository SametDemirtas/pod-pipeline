import { describe, expect, it, vi } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import { ValidationError } from '../../errors.js';
import type { ProductDetails } from '../../ports/product-reader.js';
import type { Mockup, MockupId, SceneCheck } from '../mockup.js';
import { CreateBestScenes, type CreateBestScenesInput } from './create-best-scenes.js';
import type { PreparedScene } from './create-scene.js';

const MUG = 'design-01-mug' as DesignId;
const DETAILS = { product: 'mug' } as unknown as ProductDetails;

const scene = (id: string, sceneCheck: SceneCheck | null = null): Mockup => ({
  id: id as MockupId,
  designId: MUG,
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

const request = (candidates: 1 | 2): CreateBestScenesInput => ({
  designId: MUG,
  mockupId: 'm1',
  prompt: 'on a table',
  look: { shape: '4:3' },
  candidates,
});

function setUp(made: (Mockup | Error)[], checks: (SceneCheck | Error)[] = []) {
  const describeProduct = { execute: vi.fn(() => Promise.resolve(DETAILS)) };
  const prepared = { prompt: 'on a table' } as unknown as PreparedScene;
  const createScene = {
    prepare: vi.fn(() => Promise.resolve(prepared)),
    generate: vi.fn(() => {
      const next = made.shift() ?? new Error('no more scenes');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    }),
  };
  const compare = {
    execute: vi.fn(({ mockupId }: { mockupId: string }) => {
      const next = checks.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(scene(mockupId, next ?? null));
    }),
  };
  const mockups = { remove: vi.fn(() => Promise.resolve()) };
  const problems = { stepFailed: vi.fn(), removalFailed: vi.fn() };
  const best = new CreateBestScenes({ describeProduct, createScene, compare, mockups, problems });
  return { best, describeProduct, createScene, prepared, mockups, problems };
}

describe('CreateBestScenes', () => {
  it('makes the scenes from the product read once, and keeps the better of two checked', async () => {
    const changed = { same: false, issues: ['3: mirrored'], unverifiable: [] };
    const same = { same: true, issues: [], unverifiable: [] };
    const { best, createScene, prepared, mockups } = setUp(
      [scene('s1'), scene('s2')],
      [changed, same],
    );

    const created = await best.execute(request(2));

    expect(created).toEqual({ scenes: [scene('s2', same)], candidateFailed: false });
    expect(createScene.prepare.mock.calls).toEqual([[{ ...request(2), details: DETAILS }]]);
    expect(createScene.generate.mock.calls).toEqual([[prepared], [prepared]]);
    expect(mockups.remove).toHaveBeenCalledWith(MUG, 's1');
  });

  it('keeps both unchecked candidates, and both when removing the worse fails', async () => {
    const broken = new Error('database is locked');
    const unchecked = setUp([scene('s1'), scene('s2')], [broken, broken]);
    const same = { same: true, issues: [], unverifiable: [] };
    const stuck = setUp([scene('s1'), scene('s2')], [same, same]);
    stuck.mockups.remove.mockRejectedValue(broken);

    expect((await unchecked.best.execute(request(2))).scenes).toHaveLength(2);
    expect((await stuck.best.execute(request(2))).scenes).toHaveLength(2);
    expect(unchecked.mockups.remove).not.toHaveBeenCalled();
    expect(unchecked.problems.stepFailed.mock.calls).toEqual([[broken], [broken]]);
    expect(stuck.problems.removalFailed).toHaveBeenCalledWith(broken);
  });

  it('keeps the scene made when another fails, and says so', async () => {
    const failure = new Error('disk full');
    const { best, problems } = setUp([failure, scene('s2')]);

    expect(await best.execute(request(2))).toEqual({
      scenes: [scene('s2')],
      candidateFailed: true,
    });
    expect(problems.stepFailed).toHaveBeenCalledWith(failure);
  });

  it('passes on the first failure when no scene is made and reports the others', async () => {
    const [first, second] = [new Error('quota exceeded'), new Error('disk full')];
    const { best, problems } = setUp([first, second]);

    await expect(best.execute(request(2))).rejects.toBe(first);
    expect(problems.stepFailed.mock.calls).toEqual([[second]]);
  });

  it('makes scenes without the product read when reading fails, but not for a bad request', async () => {
    const unread = setUp([scene('s1')]);
    const broken = new Error('reader is down');
    unread.describeProduct.execute.mockRejectedValue(broken);
    const refused = setUp([scene('s1')]);
    refused.describeProduct.execute.mockRejectedValue(
      new ValidationError('mockupId', 'is a scene'),
    );

    expect((await unread.best.execute(request(1))).scenes).toHaveLength(1);
    expect(unread.createScene.prepare).toHaveBeenCalledWith({ ...request(1), details: null });
    expect(unread.problems.stepFailed).toHaveBeenCalledWith(broken);
    await expect(refused.best.execute(request(1))).rejects.toBeInstanceOf(ValidationError);
    expect(refused.createScene.prepare).not.toHaveBeenCalled();
  });

  it('rejects an empty prompt before reading the product', async () => {
    const { best, describeProduct } = setUp([scene('s1')]);

    await expect(best.execute({ ...request(1), prompt: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(describeProduct.execute).not.toHaveBeenCalled();
  });
});
