import { uprightRevision, type Design } from '../catalog/model.js';
import type { MockupGenerator, MockupOrientation } from '../ports/print-provider.js';
import { crossesOrientation, orientationOf, type Orientation } from './orientation.js';
import type { PrintArea } from './print-product.js';

/** Asks the provider whether it takes a print area turned a quarter. */
export type OrientationSupport = Pick<MockupGenerator, 'supportsOrientation'>;

/** The artwork the right way up on the print area turned to match it. */
export interface UprightTarget {
  /** The revision whose artwork is printed: the one from before any turn. */
  readonly source: Design;
  /** The area turned a quarter, so it has the artwork's orientation. */
  readonly area: PrintArea;
  readonly orientation: MockupOrientation;
}

export interface UprightTargetQuery {
  readonly productId: string;
  readonly variantId: string;
  readonly area: PrintArea;
}

const PROVIDER_ORIENTATION: Record<Orientation, MockupOrientation | undefined> = {
  landscape: 'horizontal',
  portrait: 'vertical',
  square: undefined,
};

/** The area turned a quarter: its width and height swapped. */
export function turnedArea(area: PrintArea): PrintArea {
  return { ...area, width: area.height, height: area.width };
}

/**
 * Where artwork of the other orientation than its print area is printed
 * upright instead of turned, e.g. portrait artwork on a blanket the provider
 * lists landscape but also makes portrait. Applies to artwork turned before,
 * whose revision from before the turn is used, as well as to artwork left as
 * it is. `undefined` when the orientations already match, the upright
 * revision is not stored, or the provider does not take the area turned.
 */
export async function uprightTarget(
  design: Design,
  revisions: readonly Design[],
  query: UprightTargetQuery,
  support: OrientationSupport | undefined,
): Promise<UprightTarget | undefined> {
  if (!support?.supportsOrientation) return undefined;
  const source = uprightRevision(design, revisions);
  const { area } = query;
  if (!source || !crossesOrientation(source.asset, area)) return undefined;
  const turned = turnedArea(area);
  const orientation = PROVIDER_ORIENTATION[orientationOf(turned)];
  if (!orientation) return undefined;
  const supported = await support.supportsOrientation({
    productId: query.productId,
    variantId: query.variantId,
    placement: area.placement,
    orientation,
  });
  return supported ? { source, area: turned, orientation } : undefined;
}
