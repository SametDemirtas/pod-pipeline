import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../../catalog/model.js';
import type { CatalogWriter } from '../../ports/catalog-repositories.js';
import type { MockupRepository, MockupSlot } from '../../ports/mockups.js';
import type { ProductDetails } from '../../ports/product-reader.js';
import type { Mockup, MockupId } from '../../mockups/mockup.js';
import { sampleConcept, sampleDesign } from './samples.js';

export interface MockupPersistence {
  readonly catalog: CatalogWriter;
  readonly mockups: MockupRepository;
}

const MUG = 'design-01-mug' as DesignId;
const BLANKET = 'design-01-blanket' as DesignId;
const SMALL: MockupSlot = { variantId: '1320', printArea: 'default' };
const LARGE: MockupSlot = { variantId: '4830', printArea: 'default' };
const SMALL_BACK: MockupSlot = { variantId: '1320', printArea: 'back' };

function sampleMockup(id: string, designId: DesignId, slot: MockupSlot, view = 'Front'): Mockup {
  return {
    id: id as MockupId,
    designId,
    designRevision: 1,
    ...slot,
    view,
    scenePrompt: null,
    sceneCheck: null,
    printConfirmed: false,
    sourceAsset: null,
    asset: {
      sha256: `sha-${id}`,
      storageKey: `assets/sha-${id}`,
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      byteSize: 2048,
    },
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };
}

/** Behaviour every mockup repository must share. */
export function describeMockupContract(
  name: string,
  create: () => Promise<MockupPersistence> | MockupPersistence,
): void {
  describe(`${name} mockup contract`, () => {
    let current: MockupPersistence;
    const store = () => current;

    beforeEach(async () => {
      current = await create();
      await current.catalog.concepts.save(sampleConcept('01'));
      await current.catalog.designs.save(sampleDesign('01-mug'));
      await current.catalog.designs.save(sampleDesign('01-blanket'));
    });

    describePhotoSets(store);
    describeSceneRecords(store);
    describeProductDetails(store);
  });
}

/** Storing, replacing and removing the photos of each slot. */
function describePhotoSets(store: () => MockupPersistence): void {
  it('lists nothing for a design without photos', async () => {
    expect(await store().mockups.listForDesign(MUG)).toEqual([]);
  });

  it('lists the newest photos first, each set in the order it was made', async () => {
    const older = [sampleMockup('a1', MUG, SMALL), sampleMockup('a2', MUG, SMALL, 'Left')];
    const newer = [sampleMockup('b1', MUG, LARGE), sampleMockup('b2', MUG, LARGE, 'Left')];
    await store().mockups.replace(MUG, SMALL, older);
    await store().mockups.replace(MUG, LARGE, newer);

    expect(await store().mockups.listForDesign(MUG)).toEqual([...newer, ...older]);
  });

  it('replaces only the photos of the same design, variant and print area', async () => {
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.replace(MUG, LARGE, [sampleMockup('b1', MUG, LARGE)]);
    await store().mockups.replace(MUG, SMALL_BACK, [sampleMockup('d1', MUG, SMALL_BACK)]);
    await store().mockups.replace(BLANKET, SMALL, [sampleMockup('c1', BLANKET, SMALL)]);

    await store().mockups.replace(MUG, SMALL, [sampleMockup('a9', MUG, SMALL)]);

    const ids = (await store().mockups.listForDesign(MUG)).map((mockup) => mockup.id);
    expect(ids).toEqual(['a9', 'd1', 'b1']);
    expect(await store().mockups.listForDesign(BLANKET)).toHaveLength(1);
  });

  it('removes the photos of a slot when replaced with none', async () => {
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.replace(MUG, SMALL, []);

    expect(await store().mockups.listForDesign(MUG)).toEqual([]);
  });

  it('removes a single photo of the right design', async () => {
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.add([{ ...sampleMockup('s1', MUG, SMALL), scenePrompt: 'p' }]);

    await store().mockups.remove(BLANKET, 's1' as MockupId);
    await store().mockups.remove(MUG, 's1' as MockupId);
    await store().mockups.remove(MUG, 'gone' as MockupId);

    expect((await store().mockups.listForDesign(MUG)).map((mockup) => mockup.id)).toEqual(['a1']);
  });
}

/** Scenes, with their checks and the seller's confirmations. */
function describeSceneRecords(store: () => MockupPersistence): void {
  it('keeps scenes when the provider photos of their slot are replaced', async () => {
    const scene = {
      ...sampleMockup('s1', MUG, SMALL, 'Scene'),
      scenePrompt: 'on a table',
      sceneLook: { shape: '1:1', lighting: 'moody', cameraHeight: 'slightlyAbove' } as const,
      sceneCheck: {
        same: false,
        issues: ["2: 'COFFEE' became 'COFFE'"],
        unverifiable: ['4: the handle hides the edge'],
      },
      sourceAsset: sampleMockup('a1', MUG, SMALL).asset,
    };
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.add([scene]);

    await store().mockups.replace(MUG, SMALL, [sampleMockup('a2', MUG, SMALL)]);

    expect((await store().mockups.listForDesign(MUG)).map((mockup) => mockup.id)).toEqual([
      'a2',
      's1',
    ]);
    expect((await store().mockups.listForDesign(MUG))[1]).toEqual(scene);
  });

  it("records a scene's check and the seller's confirmation each on its own", async () => {
    const scene = { ...sampleMockup('s1', MUG, SMALL, 'Scene'), scenePrompt: 'on a table' };
    await store().mockups.add([scene]);
    const same = { same: true, issues: ['7: a little flat'], unverifiable: ['2: tiny text'] };
    const changed = { same: false, issues: ['3: mirrored'], unverifiable: [] };
    const stored = async () => (await store().mockups.listForDesign(MUG))[0];

    await store().mockups.setConfirmed(BLANKET, 's1' as MockupId, true);
    await store().mockups.saveCheck(BLANKET, 's1' as MockupId, changed);
    expect(await stored()).toEqual(scene);

    await store().mockups.setConfirmed(MUG, 's1' as MockupId, true);
    await store().mockups.saveCheck(MUG, 's1' as MockupId, same);
    expect(await stored()).toEqual({ ...scene, sceneCheck: same, printConfirmed: true });

    // A check that finds the print changed takes the confirmation back.
    await store().mockups.saveCheck(MUG, 's1' as MockupId, changed);
    expect(await stored()).toEqual({ ...scene, sceneCheck: changed, printConfirmed: false });

    // Confirming keeps the check.
    await store().mockups.setConfirmed(MUG, 's1' as MockupId, true);
    await store().mockups.setConfirmed(MUG, 'gone' as MockupId, true);
    await store().mockups.saveCheck(MUG, 'gone' as MockupId, same);
    expect(await stored()).toEqual({ ...scene, sceneCheck: changed, printConfirmed: true });
  });
}

/** What the product in each photo looks like. */
function describeProductDetails(store: () => MockupPersistence): void {
  it("keeps a photo's product details until the photo is replaced", async () => {
    const details: ProductDetails = {
      product: 'white ceramic mug',
      material: 'glossy ceramic',
      printPlacement: 'centred',
      printHasLettering: false,
      printColors: ['navy', 'coral'],
      notMistakenFor: 'a travel mug',
    };
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.replace(MUG, LARGE, [sampleMockup('b1', MUG, LARGE)]);
    const read = (id: string, designId = MUG) =>
      store().mockups.productDetails(designId, id as MockupId);

    expect(await read('a1')).toBeNull();
    await store().mockups.saveProductDetails(MUG, 'a1' as MockupId, details);
    await store().mockups.saveProductDetails(MUG, 'gone' as MockupId, details);
    expect([await read('a1'), await read('b1'), await read('a1', BLANKET)]).toEqual([
      details,
      null,
      null,
    ]);
    expect(await read('gone')).toBeNull();

    await store().mockups.setConfirmed(MUG, 'a1' as MockupId, true);
    await store().mockups.saveCheck(MUG, 'a1' as MockupId, {
      same: true,
      issues: [],
      unverifiable: [],
    });
    expect(await read('a1')).toEqual(details);

    await store().mockups.saveProductDetails(MUG, 'b1' as MockupId, details);
    await store().mockups.replace(MUG, SMALL, [sampleMockup('a1', MUG, SMALL)]);
    await store().mockups.remove(MUG, 'b1' as MockupId);
    await store().mockups.replace(MUG, LARGE, [sampleMockup('b1', MUG, LARGE)]);
    expect([await read('a1'), await read('b1')]).toEqual([null, null]);
  });
}
