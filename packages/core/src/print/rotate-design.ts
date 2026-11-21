import { familyProfileOf } from '@pod/rules';
import { disposeQuietly } from '../assets/store-image.js';
import { requireDesign } from '../catalog/catalog-queries.js';
import {
  importedSha256,
  keptOrientationOf,
  type Design,
  type QuarterTurn,
} from '../catalog/model.js';
import { PrintFileTooLargeError, ValidationError } from '../errors.js';
import type { CatalogQuery, DesignRepository } from '../ports/catalog-repositories.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { AssetStore } from '../ports/files.js';
import type { ImageRotator } from '../ports/image-rotator.js';
import { PREVIEW_SIDE, type ImagePreviews } from '../ports/previews.js';
import type { RotationAdvisor } from '../ports/rotation-advisor.js';
import type { Clock } from '../ports/system.js';
import type { StopSignal } from '../ports/work.js';
import { crossesOrientation, orientationOf } from './orientation.js';
import { MAX_PRINT_FILE_BYTES } from './print-file-size.js';
import type { Size } from './placement.js';
import type { PrintArea } from './print-product.js';
import {
  uprightTarget,
  type OrientationSupport,
  type UprightTargetQuery,
} from './upright-target.js';

/** Where a design's listing prints. */
export interface ListedAreas {
  /** The areas of every size the listing sells. */
  readonly printAreas: readonly PrintArea[];
  /**
   * Each variant the listing sells with its area; when the provider takes
   * every one of them turned a quarter, the artwork is printed upright on it
   * and so not turned.
   */
  readonly printTargets?: readonly UprightTargetQuery[] | undefined;
}

export interface RotateDesignInput {
  readonly designId: string;
  /** Asked only for artwork that may be turned, as finding the areas may ask the print provider. */
  readonly listedAreas: () => Promise<ListedAreas>;
  readonly signal?: StopSignal | undefined;
}

/**
 * `unneeded` when the artwork already fits the areas' orientation, was turned
 * before, is for a product that is not turned, or is printed upright on the
 * areas turned a quarter because the provider takes them so; `kept` when the checking
 * model found it should stay as it is, now or before for the same imported file.
 */
export type RotateDesignResult =
  | { readonly status: 'unneeded'; readonly design: Design }
  | { readonly status: 'kept' | 'rotated'; readonly design: Design; readonly reason: string };

export interface RotateDesignDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly designs: Pick<DesignRepository, 'save' | 'keepOrientation'>;
  readonly previews: ImagePreviews;
  readonly advisor: RotationAdvisor;
  readonly rotator: ImageRotator;
  readonly assets: AssetStore & AssetLocator;
  readonly clock: Clock;
  /** Whether the provider takes a print area turned a quarter; without it artwork may be turned. */
  readonly orientation?: OrientationSupport | undefined;
}

/**
 * Stores the artwork turned a quarter as the design's next revision when it
 * has the other orientation than every area its listing sells, e.g. portrait
 * artwork for a landscape blanket, so it fills the area instead of being
 * cropped. A model that reads images decides which way keeps the artwork
 * upright once the product is turned, or that it is better left as it is.
 */
export class RotateDesign {
  constructor(private readonly deps: RotateDesignDeps) {}

  async execute(input: RotateDesignInput): Promise<RotateDesignResult> {
    const { design } = await requireDesign(this.deps.query, input.designId);
    if (!mayTurn(design)) return { status: 'unneeded', design };
    const { printAreas, printTargets } = await input.listedAreas();
    const [area] = printAreas;
    if (!area || !printAreas.every((each) => turnsToFit(design, each))) {
      return { status: 'unneeded', design };
    }
    if (await this.printsUpright(design, printTargets)) return { status: 'unneeded', design };
    // The model is asked once per imported file, so the answer stays the same and costs once.
    const kept = keptOrientationOf(design);
    if (kept) return { status: 'kept', design, reason: kept.reason };
    if (design.asset.mimeType !== 'image/png') {
      throw new ValidationError('artwork', 'only PNG artwork can be turned');
    }
    const advice = await this.deps.advisor.advise({
      artwork: await this.deps.previews.preview(design.asset, PREVIEW_SIDE),
      artworkOrientation: orientationOf(design.asset),
      areaOrientation: orientationOf(area),
      product: design.familyId,
    });
    if (advice.degrees === 0) {
      const decision = { sha256: importedSha256(design), reason: advice.reason };
      await this.deps.designs.keepOrientation(design.id, decision);
      return {
        status: 'kept',
        design: { ...design, keptOrientation: decision },
        reason: advice.reason,
      };
    }
    const turned = await this.turn(design, advice.degrees, advice.reason, input.signal);
    return { status: 'rotated', design: turned, reason: advice.reason };
  }

  /** Whether the provider prints the artwork upright on every listed area turned a quarter. */
  private async printsUpright(
    design: Design,
    targets: readonly UprightTargetQuery[] | undefined,
  ): Promise<boolean> {
    const { orientation } = this.deps;
    if (!orientation || !targets || targets.length === 0) return false;
    for (const target of targets) {
      if (!(await uprightTarget(design, [design], target, orientation))) return false;
    }
    return true;
  }

  private async turn(
    design: Design,
    degrees: QuarterTurn,
    reason: string,
    signal: StopSignal | undefined,
  ): Promise<Design> {
    const source = this.deps.assets.pathOf(design.asset.storageKey);
    const file = await this.deps.rotator.rotate(source, degrees, signal);
    try {
      if (file.byteSize > MAX_PRINT_FILE_BYTES) {
        throw new PrintFileTooLargeError(file.byteSize, MAX_PRINT_FILE_BYTES);
      }
      const stored = await this.deps.assets.put(file.absolutePath, 'image/png');
      const next: Design = {
        id: design.id,
        designKey: design.designKey,
        conceptId: design.conceptId,
        familyId: design.familyId,
        revision: design.revision + 1,
        asset: { ...stored, mimeType: 'image/png', width: file.width, height: file.height },
        sourcePath: design.sourcePath,
        createdAt: design.createdAt,
        updatedAt: this.deps.clock.now(),
        upscale: design.upscale,
        rotation: { degrees, originalSha256: importedSha256(design), reason },
      };
      await this.deps.designs.save(next);
      return next;
    } finally {
      await disposeQuietly(file);
    }
  }
}

/** Whether the artwork may still be turned: once only, and for a product that hangs either way up. */
function mayTurn(design: Pick<Design, 'familyId' | 'rotation'>): boolean {
  return !design.rotation && familyProfileOf(design.familyId).turnable;
}

/** Whether the artwork is turned to fill `area`, having the other orientation than it. */
export function turnsToFit(
  design: Pick<Design, 'familyId' | 'rotation' | 'asset'>,
  area: Size,
): boolean {
  return mayTurn(design) && crossesOrientation(design.asset, area);
}
