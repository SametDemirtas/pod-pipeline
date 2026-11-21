import type {
  DesignDto,
  MockupDto,
  PrintAreaDto,
  PrintCheckDto,
  PrintRequest,
} from '@pod/contracts/client';
import { listingVariantIds } from './listing-variants.js';
import { familyProfileOf } from './families/family-profile.js';

/** The print of a design's listing: the main check, the variants sold and the one photographed. */
export interface ListedPrint {
  readonly check: PrintCheckDto;
  readonly variantIds: readonly string[];
  /** Of the first size the settings list, so photos show the size buyers see first. */
  readonly mainVariantId: string | undefined;
}

/**
 * The print of a design on a variant, the product's main one when left out,
 * on its main area, fitted the way the family is printed.
 */
export function listingPrint(
  design: Pick<DesignDto, 'id' | 'familyId'>,
  variantId?: string,
): PrintRequest {
  return {
    designId: design.id,
    ...(variantId === undefined ? {} : { variantId }),
    fit: familyProfileOf(design.familyId).fit,
  };
}

/** The variants the main check's listing sells, of the sizes the settings list for the family. */
export function listedPrintOf(
  check: PrintCheckDto,
  sizes: readonly string[] | undefined,
): ListedPrint {
  const variantIds = listingVariantIds(check, sizes);
  const sizeOf = (id: string) => check.variants.find((variant) => variant.id === id)?.size;
  const mainVariantId = variantIds.find((id) => sizeOf(id) === sizes?.[0]) ?? variantIds[0];
  return { check, variantIds, mainVariantId };
}

/** A variant the listing sells with the area it prints on. */
export interface ListedTarget {
  readonly productId: string;
  readonly variantId: string;
  readonly area: PrintAreaDto;
}

/** Each variant sold with its checked area, as the provider is asked about it. */
export function listedTargets({ check, variantIds }: ListedPrint): ListedTarget[] {
  const chosen = new Set(variantIds);
  return check.variants
    .filter((variant) => chosen.has(variant.id))
    .flatMap((variant) =>
      variant.areas
        .filter((area) => area.placement === check.printArea)
        .map((area) => ({ productId: check.productId, variantId: variant.id, area })),
    );
}

/** The print area of every variant sold, where the listing prints. */
export function listedAreas(listed: ListedPrint): PrintAreaDto[] {
  return listedTargets(listed).map((target) => target.area);
}

/** The sizes of the variants sold, `null` for variants without one, once each. */
export function listedSizes(listed: ListedPrint): (string | null)[] {
  const chosen = new Set(listed.variantIds);
  return [
    ...new Set(
      listed.check.variants
        .filter((variant) => chosen.has(variant.id))
        .map((variant) => variant.size),
    ),
  ];
}

/** The check with the lowest effective DPI, where the print is least sharp; the first of equals. */
export function lowestDpiPrint(checks: readonly PrintCheckDto[]): PrintCheckDto | undefined {
  return checks.reduce<PrintCheckDto | undefined>(
    (low, check) => (low && low.effectiveDpi <= check.effectiveDpi ? low : check),
    undefined,
  );
}

/** The print provider's own photos of the revision, which prepared listings show; not scenes. */
export function providerPhotos(mockups: readonly MockupDto[], revision: number): MockupDto[] {
  return mockups.filter(
    (mockup) => mockup.designRevision === revision && mockup.scenePrompt === null,
  );
}
