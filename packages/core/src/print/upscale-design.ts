import { disposeQuietly } from '../assets/store-image.js';
import { requireDesign } from '../catalog/catalog-queries.js';
import {
  importedSha256,
  type Design,
  type DesignRotation,
  type DesignUpscale,
  type ImageAsset,
} from '../catalog/model.js';
import {
  ArtworkTooSmallEvenUpscaledError,
  NotFoundError,
  PrintFileTooLargeError,
  UpscaleFailedError,
  ValidationError,
} from '../errors.js';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../catalog/image-limits.js';
import type { CatalogQuery, UnitOfWork } from '../ports/catalog-repositories.js';
import type { AssetLocator, TemporaryFile } from '../ports/downloads.js';
import type { AssetStore, ImageInspector } from '../ports/files.js';
import type { ImageRotator } from '../ports/image-rotator.js';
import type { ImageScaler } from '../ports/image-scaler.js';
import type { Clock } from '../ports/system.js';
import type { UpscaleModel, Upscaler } from '../ports/upscaler.js';
import type { StopSignal, WrittenPng } from '../ports/work.js';
import type { FitMode, Size } from './placement.js';
import { checkPrint } from './print-check.js';
import { MAX_PRINT_FILE_BYTES, printFileSize } from './print-file-size.js';
import type { PrintArea } from './print-product.js';
import {
  turnedArea,
  uprightTarget,
  type OrientationSupport,
  type UprightTargetQuery,
} from './upright-target.js';

export interface UpscaleDesignInput {
  readonly designId: string;
  readonly model: UpscaleModel;
  /** Each variant the design's listing sells with its area; the file is made just large enough. */
  readonly printTargets: readonly UprightTargetQuery[];
  readonly fit: FitMode;
  readonly onProgress?: ((share: number) => void) | undefined;
  readonly signal?: StopSignal | undefined;
}

export interface UpscaleDesignDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  /** Saves the upright and the turned revision together, so neither is kept without the other. */
  readonly unitOfWork: UnitOfWork;
  readonly upscaler: Upscaler;
  readonly scaler: ImageScaler;
  /** Turns the larger copy of turned artwork the same way again. */
  readonly rotator: ImageRotator;
  readonly assets: AssetStore & AssetLocator;
  readonly inspector: ImageInspector;
  readonly clock: Clock;
  /** Whether the provider takes a print area turned a quarter, as the print check asks. */
  readonly orientation?: OrientationSupport | undefined;
}

/** What one listed variant prints, as the print check judges it. */
interface PrintedTarget {
  readonly image: Size;
  readonly area: PrintArea;
  /** The area the imported artwork, unturned, has to fill to print the same. */
  readonly uprightArea: PrintArea;
}

/**
 * Stores a larger copy of a design's artwork as its next revision, so it
 * prints sharp on large products. One rule decides: artwork that prints sharp
 * on every listed size, judged as the print check judges it, is left as it
 * is, and a copy that would still not is refused before the engine runs. The
 * copy is made from the imported artwork, which stays as an earlier revision,
 * and is only as large as the listed sizes need, so the print file stays
 * small enough to send. Turned artwork gets the larger copy unturned first and
 * then turned the same way, so a provider that prints it upright sends the
 * larger pixels too.
 */
export class UpscaleDesign {
  constructor(private readonly deps: UpscaleDesignDeps) {}

  async execute(input: UpscaleDesignInput): Promise<Design> {
    const { design, revisions } = await requireDesign(this.deps.query, input.designId);
    const targets = await this.printedTargets(design, revisions, input.printTargets);
    if (targets.every(({ image, area }) => printsGood(image, area, input.fit))) return design;
    const original = importedArtwork(design, revisions);
    const areas = targets.map((target) => target.uprightArea);
    const larger = this.largerSize(original);
    const size = printFileSize(larger, areas, input.fit);
    if (!areas.every((area) => printsGood(size, area, input.fit))) {
      throw new ArtworkTooSmallEvenUpscaledError(size);
    }
    if (
      Math.max(larger.width, larger.height) > MAX_IMAGE_SIDE ||
      larger.width * larger.height > MAX_IMAGE_PIXELS
    ) {
      throw new ValidationError(
        'artwork',
        `${String(original.width)} × ${String(original.height)} is too large to make larger`,
      );
    }
    const upscaled = await this.deps.upscaler.upscale({
      image: {
        absolutePath: this.deps.assets.pathOf(original.storageKey),
        mimeType: original.mimeType,
      },
      model: input.model,
      onProgress: input.onProgress,
      signal: input.signal,
    });
    const printFile = await this.printFile(upscaled, larger, size, input.signal);
    const upscale = { model: input.model, originalSha256: original.sha256 };
    return this.store(design, printFile, upscale, input.signal);
  }

  /** What every listed variant prints: the upright revision where the provider takes the area turned. */
  private printedTargets(
    design: Design,
    revisions: readonly Design[],
    queries: readonly UprightTargetQuery[],
  ): Promise<PrintedTarget[]> {
    return Promise.all(
      queries.map(async (query) => {
        const upright = await uprightTarget(design, revisions, query, this.deps.orientation);
        if (upright) {
          return { image: upright.source.asset, area: upright.area, uprightArea: upright.area };
        }
        const uprightArea = design.rotation ? turnedArea(query.area) : query.area;
        return { image: design.asset, area: query.area, uprightArea };
      }),
    );
  }

  private largerSize(asset: ImageAsset): Size {
    const { scale } = this.deps.upscaler;
    return { width: asset.width * scale, height: asset.height * scale };
  }

  /** The engine's image, checked, at the size the listed areas need. */
  private async printFile(
    upscaled: TemporaryFile,
    larger: Size,
    size: Size,
    signal: StopSignal | undefined,
  ): Promise<WrittenPng> {
    try {
      const info = await this.deps.inspector.inspect(upscaled.absolutePath);
      if (!info) throw new UpscaleFailedError('no image was written');
      if (info.width !== larger.width || info.height !== larger.height) {
        throw new UpscaleFailedError(
          `wrote ${String(info.width)} × ${String(info.height)} pixels, not ${String(larger.width)} × ${String(larger.height)}`,
        );
      }
      return await this.deps.scaler.scale(upscaled.absolutePath, size, signal);
    } finally {
      await disposeQuietly(upscaled);
    }
  }

  /**
   * Stores the print file as the next revision, and for turned artwork that
   * file turned as the one after it; nothing is stored unless both can be sent.
   */
  private async store(
    design: Design,
    printFile: WrittenPng,
    upscale: DesignUpscale,
    signal: StopSignal | undefined,
  ): Promise<Design> {
    const files = [printFile];
    try {
      const { rotation } = design;
      if (rotation) {
        files.push(
          await this.deps.rotator.rotate(printFile.absolutePath, rotation.degrees, signal),
        );
      }
      for (const file of files) {
        if (file.byteSize > MAX_PRINT_FILE_BYTES) {
          throw new PrintFileTooLargeError(file.byteSize, MAX_PRINT_FILE_BYTES);
        }
      }
      const upright = await this.next(design, printFile, upscale, undefined);
      const [, turned] = files;
      const revisions =
        turned && rotation
          ? [upright, await this.next(upright, turned, upscale, rotation)]
          : [upright];
      await this.deps.unitOfWork.run(async (tx) => {
        for (const revision of revisions) await tx.designs.save(revision);
      });
      return revisions[revisions.length - 1] ?? upright;
    } finally {
      for (const file of files) await disposeQuietly(file);
    }
  }

  /** Stores `file` and makes it the revision after `previous`, not yet saved. */
  private async next(
    previous: Design,
    file: WrittenPng,
    upscale: DesignUpscale,
    rotation: DesignRotation | undefined,
  ): Promise<Design> {
    const stored = await this.deps.assets.put(file.absolutePath, 'image/png');
    return {
      id: previous.id,
      designKey: previous.designKey,
      conceptId: previous.conceptId,
      familyId: previous.familyId,
      revision: previous.revision + 1,
      asset: { ...stored, mimeType: 'image/png', width: file.width, height: file.height },
      sourcePath: previous.sourcePath,
      createdAt: previous.createdAt,
      updatedAt: this.deps.clock.now(),
      upscale,
      rotation,
    };
  }
}

function printsGood(image: Size, area: PrintArea, fit: FitMode): boolean {
  return checkPrint(image, area, fit).quality === 'good';
}

/** The artwork as imported: neither made larger nor turned. */
function importedArtwork(design: Design, revisions: readonly Design[]): ImageAsset {
  const sha256 = importedSha256(design);
  const imported = [design, ...revisions].find(
    (revision) => !revision.upscale && !revision.rotation && revision.asset.sha256 === sha256,
  );
  if (!imported) throw new NotFoundError('Imported artwork', sha256);
  return imported.asset;
}
