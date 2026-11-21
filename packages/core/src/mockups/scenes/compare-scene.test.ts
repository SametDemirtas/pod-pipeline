import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId, ImageAsset } from '../../catalog/model.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { ImagePreviews, PreviewImage } from '../../ports/previews.js';
import { FakeSceneInspector, InMemoryMockups } from '../../testing/index.js';
import { CHECK_PREVIEW_SIDE, CompareScene } from './compare-scene.js';
import { ConfirmScenePrint } from './confirm-scene-print.js';
import type { Mockup, MockupId } from '../mockup.js';

const MUG = 'design-01-mug' as DesignId;

const asset = (id: string): ImageAsset => ({
  sha256: id,
  storageKey: `ab/${id}`,
  mimeType: 'image/png',
  width: 10,
  height: 10,
  byteSize: 1,
});

const scene = (id: string, overrides: Partial<Mockup> = {}): Mockup => ({
  id: id as MockupId,
  designId: MUG,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: 'Scene',
  scenePrompt: 'on a table',
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: asset('front'),
  asset: asset(id),
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
  ...overrides,
});

const same = { same: true, issues: [], unverifiable: [] };
const mirrored = { same: false, issues: ['3: the print is mirrored'], unverifiable: [] };

/** Previews named after the stored file, with the side they were asked at. */
class NamedPreviews implements ImagePreviews {
  readonly asked: [string, number | undefined][] = [];

  preview(image: ImageAsset, side?: number): Promise<PreviewImage> {
    this.asked.push([image.storageKey, side]);
    return Promise.resolve({
      data: new TextEncoder().encode(image.storageKey),
      mimeType: 'image/jpeg',
    });
  }
}

describe('CompareScene', () => {
  let mockups: InMemoryMockups;
  let previews: NamedPreviews;
  let inspector: FakeSceneInspector;
  let compare: CompareScene;

  const run = (mockupId: string) => compare.execute({ designId: MUG, mockupId });

  beforeEach(() => {
    mockups = new InMemoryMockups();
    previews = new NamedPreviews();
    inspector = new FakeSceneInspector();
    compare = new CompareScene({ mockups, previews, inspector });
  });

  it('compares the source photo with the scene at a large preview size and keeps the result', async () => {
    await mockups.add([scene('s1')]);
    inspector.answer = { same: true, issues: [], unverifiable: ['2: the small text is blurred'] };

    const checked = await run('s1');

    expect(previews.asked).toEqual([
      ['ab/front', CHECK_PREVIEW_SIDE],
      ['ab/s1', CHECK_PREVIEW_SIDE],
    ]);
    expect(
      inspector.compared.map((pair) => pair.map((image) => new TextDecoder().decode(image.data))),
    ).toEqual([['ab/front', 'ab/s1']]);
    expect(checked).toMatchObject({ sceneCheck: inspector.answer, printConfirmed: false });
    expect(await mockups.listForDesign(MUG)).toEqual([checked]);
  });

  it('keeps the confirmation when the print is still the same', async () => {
    await mockups.add([scene('s1', { printConfirmed: true })]);
    inspector.answer = { ...same, issues: ['7: the mug floats a little'] };

    expect((await run('s1')).printConfirmed).toBe(true);
  });

  it('takes the confirmation back when the print is found changed', async () => {
    await mockups.add([scene('s1', { printConfirmed: true })]);
    inspector.answer = mirrored;

    expect(await run('s1')).toMatchObject({ sceneCheck: mirrored, printConfirmed: false });
  });

  it.each([
    ['keeps a confirmation given while a check that finds the print the same runs', same, true],
    ['takes back a confirmation given while a check that finds it changed runs', mirrored, false],
  ])('%s', async (_case, answer, confirmed) => {
    await mockups.add([scene('s1')]);
    let finish: () => void = () => undefined;
    inspector.hold = new Promise((resolve) => {
      finish = resolve;
    });
    inspector.answer = answer;

    const checking = run('s1');
    await new ConfirmScenePrint(mockups).execute({
      designId: MUG,
      mockupId: 's1',
      confirmed: true,
    });
    finish();

    expect(await checking).toMatchObject({ sceneCheck: answer, printConfirmed: confirmed });
    expect((await mockups.listForDesign(MUG))[0]?.printConfirmed).toBe(confirmed);
  });

  it('passes on a failed check and changes nothing', async () => {
    const confirmed = scene('s1', { printConfirmed: true, sceneCheck: same });
    await mockups.add([confirmed]);
    inspector.failWith = new Error('Claude is not connected');

    await expect(run('s1')).rejects.toThrow('Claude is not connected');
    expect(await mockups.listForDesign(MUG)).toEqual([confirmed]);
  });

  it.each([
    ['an unknown photo', 'gone', NotFoundError],
    ["the print provider's own photo", 'm1', ValidationError],
    ['a scene whose source photo is not known', 'old', ValidationError],
  ])('refuses %s', async (_case, mockupId, error) => {
    await mockups.add([
      scene('m1', { scenePrompt: null, view: 'Front', sourceAsset: null }),
      scene('old', { sourceAsset: null }),
    ]);

    await expect(run(mockupId)).rejects.toBeInstanceOf(error);
    expect(inspector.compared).toEqual([]);
  });
});
