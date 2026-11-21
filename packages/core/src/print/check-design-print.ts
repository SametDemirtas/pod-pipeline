import type { Design, DesignView } from '../catalog/model.js';
import { requireDesign } from '../catalog/catalog-queries.js';
import { NotFoundError, PrintProductUnavailableError, ValidationError } from '../errors.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { PrintCatalog } from '../ports/print-provider.js';
import { isFitMode } from './placement.js';
import { checkPrint, type PrintCheck } from './print-check.js';
import type { PrintArea, PrintProduct, PrintVariant } from './print-product.js';
import { uprightTarget, type OrientationSupport, type UprightTarget } from './upright-target.js';

export interface CheckDesignPrintInput {
  readonly designId: string;
  /** The product's first variant when left out. */
  readonly variantId?: string | undefined;
  /** Provider name of the print area; the variant's main area when left out. */
  readonly printArea?: string | undefined;
  readonly fit: string;
}

export interface DesignPrintCheck {
  readonly design: DesignView;
  /** The design's revisions, newest first; the first is the current one. */
  readonly revisions: readonly Design[];
  readonly product: PrintProduct;
  readonly variant: PrintVariant;
  readonly area: PrintArea;
  /**
   * Set when the provider prints the artwork upright on the area turned a
   * quarter, rather than the current revision on `area` as listed; `check`
   * is then for that.
   */
  readonly upright?: UprightTarget | undefined;
  readonly check: PrintCheck;
}

/** How the current revision of a design would print on one area of a product variant. */
export class CheckDesignPrint {
  constructor(
    private readonly query: Pick<CatalogQuery, 'getDesign'>,
    private readonly printCatalog: PrintCatalog,
    /** Without it artwork is always checked on the area as the provider lists it. */
    private readonly orientation?: OrientationSupport,
  ) {}

  async execute(input: CheckDesignPrintInput): Promise<DesignPrintCheck> {
    const { fit } = input;
    if (!isFitMode(fit)) throw new ValidationError('fit', `unknown fit "${fit}"`);

    const { design, revisions } = await requireDesign(this.query, input.designId);
    const product = await this.printCatalog.findProduct(design.familyId);
    if (!product || product.variants.length === 0) {
      throw new PrintProductUnavailableError(design.familyId);
    }

    const variant = pick(product.variants, input.variantId, (candidate) => candidate.id);
    if (!variant) throw new NotFoundError('Variant', input.variantId ?? product.productId);
    const area = pick(variant.areas, input.printArea, (candidate) => candidate.placement);
    if (!area) throw new NotFoundError('Print area', input.printArea ?? variant.id);

    const upright = await uprightTarget(
      design,
      revisions,
      { productId: product.productId, variantId: variant.id, area },
      this.orientation,
    );
    return {
      design,
      revisions,
      product,
      variant,
      area,
      upright,
      check: upright
        ? checkPrint(upright.source.asset, upright.area, fit)
        : checkPrint(design.asset, area, fit),
    };
  }
}

function pick<T>(items: readonly T[], wanted: string | undefined, keyOf: (item: T) => string) {
  return wanted === undefined ? items[0] : items.find((item) => keyOf(item) === wanted);
}
