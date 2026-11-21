import type { DesignId, Mockup, MockupId } from '@pod/core';

/** A Printful photo of the 01 mug's first revision. */
export const photo: Mockup = {
  id: 'm1' as MockupId,
  designId: 'design-01-mug' as DesignId,
  designRevision: 1,
  variantId: '1320',
  printArea: 'default',
  view: 'Front',
  scenePrompt: null,
  sceneCheck: null,
  printConfirmed: false,
  sourceAsset: null,
  asset: {
    sha256: 'm1',
    storageKey: 'ab/m1',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteSize: 1,
  },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
};
