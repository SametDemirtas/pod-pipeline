import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { InMemoryMockups } from '../../testing/index.js';
import { ConfirmScenePrint } from './confirm-scene-print.js';
import type { Mockup, MockupId } from '../mockup.js';

const MUG = 'design-01-mug' as DesignId;

const photo = (id: string, scenePrompt: string | null): Mockup => ({
  id: id as MockupId,
  designId: MUG,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: scenePrompt ? 'Scene' : 'Front',
  scenePrompt,
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: id,
    storageKey: `ab/${id}`,
    mimeType: 'image/png',
    width: 10,
    height: 10,
    byteSize: 1,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
});

describe('ConfirmScenePrint', () => {
  let mockups: InMemoryMockups;
  let confirm: ConfirmScenePrint;

  beforeEach(async () => {
    mockups = new InMemoryMockups();
    await mockups.add([photo('s1', 'on a table'), photo('m1', null)]);
    confirm = new ConfirmScenePrint(mockups);
  });

  it('records the confirmation and takes it back', async () => {
    const confirmed = await confirm.execute({ designId: MUG, mockupId: 's1', confirmed: true });

    expect(confirmed.printConfirmed).toBe(true);
    expect((await mockups.listForDesign(MUG))[0]?.printConfirmed).toBe(true);
    await confirm.execute({ designId: MUG, mockupId: 's1', confirmed: false });
    expect((await mockups.listForDesign(MUG))[0]?.printConfirmed).toBe(false);
  });

  it.each([
    ['an unknown photo', 'gone', NotFoundError],
    ["the print provider's own photo", 'm1', ValidationError],
  ])('refuses %s', async (_case, mockupId, error) => {
    await expect(
      confirm.execute({ designId: MUG, mockupId, confirmed: true }),
    ).rejects.toBeInstanceOf(error);
  });
});
