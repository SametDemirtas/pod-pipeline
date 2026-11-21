import type { DesignDto, ImportPreviewDto, MockupDto, PrintCheckDto } from '@pod/contracts/client';

export function designDto(
  designKey: string,
  conceptName: string | null = `Concept ${designKey}`,
): DesignDto {
  if (!designKey.includes('-')) throw new Error(`"${designKey}" is not a design key like 01-mug`);
  return {
    id: `id-${designKey}`,
    designKey,
    familyId: designKey.slice(designKey.indexOf('-') + 1),
    revision: 1,
    concept: {
      id: `c-${designKey}`,
      key: designKey.slice(0, designKey.indexOf('-')),
      name: conceptName,
    },
    asset: {
      storageKey: `ab/${designKey}.png`,
      sha256: designKey,
      mimeType: 'image/png',
      width: 3840,
      height: 1648,
      byteSize: 9_805_738,
    },
    sourcePath: `/designs/${designKey}.png`,
    upscaleModel: null,
    rotation: null,
    rotationReason: null,
    keptOrientationReason: null,
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
  };
}

/** A shirt in two colours and two sizes, printable on the front and the back. */
export function shirtVariants(): PrintCheckDto['variants'] {
  const areas = ['front', 'back'].map((placement) => ({
    placement,
    width: 1800,
    height: 2400,
    dpi: 150,
  }));
  return ['Black', 'White'].flatMap((color, colorIndex) =>
    ['M', 'L'].map((size, sizeIndex) => ({
      id: String(4000 + colorIndex * 10 + sizeIndex),
      name: `Shirt (${color} / ${size})`,
      color,
      size,
      areas: color === 'White' && size === 'L' ? areas.slice(0, 1) : areas,
    })),
  );
}

export function printCheckDto(overrides: Partial<PrintCheckDto> = {}): PrintCheckDto {
  return {
    designId: 'id-01-mug',
    productId: '19',
    productName: 'White Glossy Mug',
    variants: [
      {
        id: '1320',
        name: 'White Glossy Mug 11 oz',
        color: 'White',
        size: '11 oz',
        areas: [{ placement: 'default', width: 2700, height: 1050, dpi: 300 }],
      },
      {
        id: '4830',
        name: 'White Glossy Mug 15 oz',
        color: 'White',
        size: '15 oz',
        areas: [{ placement: 'default', width: 2700, height: 1140, dpi: 300 }],
      },
    ],
    variantId: '1320',
    printArea: 'default',
    fit: 'contain',
    placement: { left: 127, top: 0, width: 2447, height: 1050 },
    effectiveDpi: 470,
    quality: 'good',
    areaCovered: 0.906,
    imageCropped: 0,
    turnsToFit: false,
    upright: null,
    productFacts: { material: '', care: '', fit: '', size: '' },
    ...overrides,
  };
}

export function mockupDto(
  id: string,
  view: string,
  variantId = '1320',
  printArea = 'default',
): MockupDto {
  return {
    id,
    designRevision: 1,
    variantId,
    printArea,
    view,
    scenePrompt: null,
    sceneLook: null,
    sceneCheck: null,
    printConfirmed: false,
    canCheckAgain: false,
    asset: {
      storageKey: `ab/${id}.png`,
      sha256: id,
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      byteSize: 200_000,
    },
    createdAt: '2026-10-24T10:00:00.000Z',
  };
}

export function previewDto(overrides: Partial<ImportPreviewDto> = {}): ImportPreviewDto {
  return {
    rootPath: '/Users/me/Designs',
    fingerprint: 'fp-1',
    items: [
      {
        designKey: '01-mug',
        conceptKey: '01',
        conceptName: 'Frost Garden',
        familyId: 'mug',
        relativePath: '01. Frost Garden/Mug.png',
        width: 3840,
        height: 1648,
        byteSize: 100,
        status: 'new',
        currentRevision: null,
        borrowed: false,
      },
    ],
    skipped: [{ relativePath: 'notes.txt', reason: 'unsupported-extension' }],
    conceptRenames: [],
    counts: { new: 1, changed: 0, unchanged: 0, skipped: 1 },
    ...overrides,
  };
}
