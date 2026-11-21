import type { MockupDto, PrintCheckDto } from '@pod/contracts';
import { turnsToFit, type DesignPrintCheck, type Mockup, type ProductFacts } from '@pod/core';
import { toAssetDto } from './asset-dto.js';

export function toPrintCheckDto(
  { design, product, variant, area, check, upright }: DesignPrintCheck,
  productFacts: ProductFacts,
): PrintCheckDto {
  return {
    designId: design.id,
    productId: product.productId,
    productName: product.name,
    variants: product.variants.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      color: candidate.color,
      size: candidate.size,
      areas: candidate.areas.map((candidateArea) => ({ ...candidateArea })),
    })),
    variantId: variant.id,
    printArea: area.placement,
    fit: check.fit,
    placement: { ...check.placement },
    effectiveDpi: check.effectiveDpi,
    quality: check.quality,
    areaCovered: check.areaCovered,
    imageCropped: check.imageCropped,
    turnsToFit: !upright && turnsToFit(design, area),
    upright: upright
      ? {
          storageKey: upright.source.asset.storageKey,
          width: upright.area.width,
          height: upright.area.height,
        }
      : null,
    productFacts: { ...productFacts },
  };
}

export function toMockupDto(mockup: Mockup): MockupDto {
  return {
    id: mockup.id,
    designRevision: mockup.designRevision,
    variantId: mockup.variantId,
    printArea: mockup.printArea,
    view: mockup.view,
    scenePrompt: mockup.scenePrompt,
    sceneLook: mockup.sceneLook ?? null,
    sceneCheck: mockup.sceneCheck,
    printConfirmed: mockup.printConfirmed,
    canCheckAgain: mockup.sourceAsset !== null,
    asset: toAssetDto(mockup.asset),
    createdAt: mockup.createdAt.toISOString(),
  };
}
