import { describe, expect, it } from 'vitest';
import { byName } from '../testing/operation-by-name.js';
import { fakeCatalog } from '../testing/fake-catalog.js';
import { catalogOperations } from './operations.js';
import {
  makeDesktopOperations,
  sceneDto,
  lookPreview,
  fakePublishing,
} from '../testing/desktop-operation-fakes.js';

describe('listing operations', () => {
  it('validate listing requests and keep publishing in the window', async () => {
    const catalog = fakeCatalog();
    const publishing = fakePublishing();
    const operations = makeDesktopOperations({ catalog, publishing });
    const request = {
      designId: 'd1',
      fit: 'contain',
      language: 'en-US',
      title: 'Mug',
      description: 'Nice',
      tags: ['mug'],
      price: 1999,
      currency: 'USD',
      variantIds: ['1320'],
      mockupIds: ['m1'],
      shippingProfileId: '316',
      readinessStateId: '151',
      productionPartnerIds: [],
    };

    await expect(byName(operations, 'createListing').handle(request)).rejects.toThrow(
      'unexpected call',
    );
    expect(catalog.createListing).toHaveBeenCalledWith(request);
    await expect(
      byName(operations, 'createListing').handle({ ...request, shippingProfileId: 'abc' }),
    ).rejects.toThrow();
    await expect(byName(operations, 'publishListing').handle({ id: 'd1' })).rejects.toThrow(
      'unexpected call',
    );
    expect(publishing.publishListing).toHaveBeenCalledWith({ id: 'd1' });
    await expect(
      byName(operations, 'writeListingText').handle({ designId: 'd1', language: 'en-US' }),
    ).resolves.toMatchObject({ title: 'T', humanizer: { fixed: 0 } });
    await expect(
      byName(operations, 'translateListingText').handle({
        title: 'T',
        description: 'D',
        tags: [],
        languages: ['de'],
      }),
    ).resolves.toEqual({ translations: [], failed: [] });
    const check = { language: 'en', title: 'NFL Mug', description: 'A mug.', tags: [] };
    await expect(byName(operations, 'checkListingText').handle(check)).resolves.toEqual({
      trademarks: ['NFL'],
      aiTells: [],
    });
    await expect(
      byName(operations, 'checkListingText').handle({ ...check, tags: 'nfl' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'checkListingText').handle({ title: 'NFL Mug', tags: [] }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'writeListingText').handle({ designId: 'd1', language: '' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'writeListingText').handle({
        designId: 'd1',
        language: 'de',
        keywords: [{ term: 'tulip mug', market: 'US', suggested: true, shops: 4 }],
      }),
    ).resolves.toMatchObject({ title: 'T' });
    for (const keyword of ['tulip mug', { term: 'tulip mug', shops: -1 }, { term: 'x', why: 1 }]) {
      await expect(
        byName(operations, 'writeListingText').handle({
          designId: 'd1',
          language: 'de',
          keywords: [keyword],
        }),
      ).rejects.toThrow();
    }
    await expect(
      byName(operations, 'createScene').handle({
        designId: 'd1',
        mockupId: 'm1',
        prompt: 'table',
        candidates: 2,
        look: { shape: '1:1', grade: 'warm' },
      }),
    ).resolves.toEqual({ scenes: [sceneDto], candidateFailed: false });
    await expect(
      byName(operations, 'createScene').handle({
        designId: 'd1',
        mockupId: 'm1',
        prompt: 'table',
        candidates: 3,
        look: { shape: '4:3' },
      }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'createScene').handle({
        designId: 'd1',
        mockupId: 'm1',
        prompt: 'table',
        candidates: 1,
        look: { shape: '4:3', lens: 'macro' },
      }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'previewSceneLook').handle({ familyId: 'mug', look: { shape: '3:4' } }),
    ).resolves.toBe(lookPreview);
    await expect(
      byName(operations, 'previewSceneLook').handle({ familyId: 'mug', look: {} }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'confirmScenePrint').handle({
        designId: 'd1',
        mockupId: 'scene-1',
        confirmed: true,
      }),
    ).resolves.toBe(sceneDto);
    await expect(
      byName(operations, 'confirmScenePrint').handle({ designId: 'd1', mockupId: 'scene-1' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'checkSceneAgain').handle({ designId: 'd1', mockupId: 'scene-1' }),
    ).resolves.toBe(sceneDto);
    await expect(
      byName(operations, 'describeSceneStyle').handle({ designId: 'd1', image: 'iVBORw0KGgo=' }),
    ).resolves.toBeNull();
    await expect(
      byName(operations, 'describeSceneStyle').handle({ designId: 'd1', image: 'not base64!' }),
    ).rejects.toThrow();
    await expect(
      byName(operations, 'removeMockup').handle({ designId: 'd1', mockupId: 'm1' }),
    ).resolves.toEqual([]);
    await expect(
      byName(operations, 'createScene').handle({
        designId: 'd1',
        mockupId: 'm1',
        prompt: '',
        candidates: 1,
        look: { shape: '4:3' },
      }),
    ).rejects.toThrow();
    await expect(byName(operations, 'getShopOptions').handle(undefined)).rejects.toThrow(
      'unexpected call',
    );
    await expect(byName(operations, 'getListing').handle({ id: 'd1' })).resolves.toBeNull();
    await expect(byName(operations, 'linkListing').handle({ id: 'd1' })).rejects.toThrow(
      'unexpected call',
    );
    expect(catalog.linkListing).toHaveBeenCalledWith({ id: 'd1' });
    await expect(byName(operations, 'refreshListing').handle({ id: 'd1' })).resolves.toBeNull();
    await expect(
      byName(operations, 'replaceListingPhotos').handle({
        designId: 'd1',
        mockupIds: ['m2', 'm1'],
      }),
    ).rejects.toThrow('unexpected call');
    expect(catalog.replaceListingPhotos).toHaveBeenCalledWith({
      designId: 'd1',
      mockupIds: ['m2', 'm1'],
    });
    await expect(
      byName(operations, 'replaceListingPhotos').handle({ designId: 'd1', mockupIds: 'm1' }),
    ).rejects.toThrow();
    await expect(byName(operations, 'listResearch').handle(undefined)).resolves.toEqual([]);
    await expect(
      byName(operations, 'researchKeywords').handle({ query: ' tulip mug ' }),
    ).rejects.toThrow('unexpected call');
    expect(catalog.researchKeywords).toHaveBeenCalledWith({ query: 'tulip mug' });
    await expect(byName(operations, 'getResearch').handle({ id: 'r1' })).rejects.toThrow(
      'unexpected call',
    );
    await expect(byName(operations, 'researchKeywords').handle({ query: ' ' })).rejects.toThrow();
    expect(catalogOperations(catalog).map((operation) => operation.name)).not.toContain(
      'publishListing',
    );
  });
});
