import { disposeQuietly, storeTemporaryImage } from '../assets/store-image.js';
import { inverseTurn, type Design, type DesignView, type ImageAsset } from '../catalog/model.js';
import type { AssetLocator, FileDownloader, TemporaryFile } from '../ports/downloads.js';
import type { FileHost, FileToShare } from '../ports/file-host.js';
import type { AssetStore, ImageInspector } from '../ports/files.js';
import type { ImageRotator } from '../ports/image-rotator.js';
import type { ImageScaler } from '../ports/image-scaler.js';
import type { MockupSlot, MockupStore } from '../ports/mockups.js';
import type {
  GeneratedMockup,
  MockupGenerator,
  MockupOrientation,
} from '../ports/print-provider.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import type {
  CheckDesignPrint,
  CheckDesignPrintInput,
  DesignPrintCheck,
} from '../print/check-design-print.js';
import type { Placement } from '../print/placement.js';
import type { PrintArea } from '../print/print-product.js';
import { designFileToShare } from '../print/design-file.js';
import type { Mockup, MockupId } from './mockup.js';

export interface CreateMockupsDeps {
  readonly checkPrint: Pick<CheckDesignPrint, 'execute'>;
  readonly generator: Pick<MockupGenerator, 'generate'>;
  readonly fileHost: FileHost;
  readonly downloader: FileDownloader;
  readonly inspector: ImageInspector;
  readonly assets: AssetStore & AssetLocator;
  readonly mockups: Pick<MockupStore, 'replace'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Makes a smaller copy of a large PNG for the photos only; without it the print file is sent. */
  readonly scaler?: ImageScaler | undefined;
  /**
   * Turns the photo of the area printed on back for a design turned to fit it,
   * so the product shows the artwork's way up, when the generator cannot
   * photograph the area turned instead; without it photos stay as made.
   */
  readonly rotator?: ImageRotator | undefined;
}

/**
 * Printful's mockup generator refuses images above about 50 MB, and a photo
 * needs far fewer pixels than a print, so a larger PNG goes at half its size.
 */
const MOCKUP_SOURCE_MAX_BYTES = 20_000_000;

/** What the provider is asked to photograph, and whether its main photo is turned back after. */
interface MockupPlan {
  /** The revision whose artwork is sent. */
  readonly source: Design;
  readonly area: PrintArea;
  readonly placement: Placement;
  readonly orientation: MockupOrientation | undefined;
  readonly turnBack: boolean;
}

/**
 * Has the print provider photograph the design on one area of a variant. The design is
 * shared only while the provider renders, and the photos are kept locally,
 * because the provider's links expire.
 */
export class CreateMockups {
  constructor(private readonly deps: CreateMockupsDeps) {}

  async execute(input: CheckDesignPrintInput): Promise<readonly Mockup[]> {
    const checked = await this.deps.checkPrint.execute(input);
    const { design, product, variant } = checked;
    const plan = this.uprightPlan(checked) ?? this.asPrintedPlan(checked);
    const file = designFileToShare(design, this.deps.assets, plan.source);
    const smaller = await this.smallerCopy(plan.source.asset, file);
    let shared;
    try {
      shared = await this.deps.fileHost.share(
        smaller ? { ...file, absolutePath: smaller.absolutePath } : file,
      );
    } finally {
      await smaller?.dispose().catch(() => undefined);
    }

    let generated: readonly GeneratedMockup[];
    try {
      generated = await this.deps.generator.generate({
        productId: product.productId,
        variantIds: [variant.id],
        area: plan.area,
        placement: plan.placement,
        imageUrl: shared.url,
        // Only a PNG can be turned back upright; other photos come as smaller JPEGs.
        lossless: plan.turnBack,
        orientation: plan.orientation,
      });
    } finally {
      // A link left behind only exposes the design until it expires, so a
      // failed clean-up must not hide the photos the provider already made.
      await shared.release().catch(() => undefined);
    }

    const mockups: Mockup[] = [];
    const slot = { variantId: variant.id, printArea: checked.area.placement };
    for (const photo of generated) {
      mockups.push(await this.keep(design, slot, photo, plan.turnBack));
    }
    await this.deps.mockups.replace(design.id, slot, mockups);
    return mockups;
  }

  /**
   * The artwork the right way up on the area turned to match it, when the
   * provider takes the area so: the revision from before any turn, or the
   * artwork as it is when it was left unturned. Every photo then shows the
   * artwork the right way up, as it is printed.
   */
  private uprightPlan({ upright, check }: DesignPrintCheck): MockupPlan | undefined {
    if (!upright) return undefined;
    return {
      source: upright.source,
      area: upright.area,
      placement: check.placement,
      orientation: upright.orientation,
      turnBack: false,
    };
  }

  /** The current revision on the area as listed; a turned design's main photo is turned back. */
  private asPrintedPlan({ design, area, check }: DesignPrintCheck): MockupPlan {
    return {
      source: design,
      area,
      placement: check.placement,
      orientation: undefined,
      turnBack: this.deps.rotator !== undefined && Boolean(design.rotation),
    };
  }

  private async smallerCopy(asset: ImageAsset, file: FileToShare) {
    const { scaler } = this.deps;
    if (!scaler || asset.mimeType !== 'image/png' || asset.byteSize <= MOCKUP_SOURCE_MAX_BYTES) {
      return undefined;
    }
    const size = { width: Math.round(asset.width / 2), height: Math.round(asset.height / 2) };
    return scaler.scale(file.absolutePath, size);
  }

  /**
   * The photo of the area printed on turned back, for a turned design. Other
   * views, such as a scene around the product, are left as the provider made them.
   */
  private async upright(
    design: DesignView,
    slot: MockupSlot,
    photo: GeneratedMockup,
    file: TemporaryFile,
  ): Promise<TemporaryFile> {
    const { rotator, inspector } = this.deps;
    if (!rotator || !design.rotation || photo.view !== slot.printArea) return file;
    try {
      const image = await inspector.inspect(file.absolutePath);
      if (image?.mimeType !== 'image/png') return file;
      const turned = await rotator.rotate(file.absolutePath, inverseTurn(design.rotation.degrees));
      await disposeQuietly(file);
      return turned;
    } catch (error) {
      await disposeQuietly(file);
      throw error;
    }
  }

  private async keep(
    design: DesignView,
    slot: MockupSlot,
    photo: GeneratedMockup,
    turnBack: boolean,
  ): Promise<Mockup> {
    const downloaded = await this.deps.downloader.download(photo.url);
    const file = turnBack ? await this.upright(design, slot, photo, downloaded) : downloaded;
    const asset = await storeTemporaryImage(this.deps, file, 'mockup', photo.url);
    return {
      id: this.deps.ids.next() as MockupId,
      designId: design.id,
      designRevision: design.revision,
      ...slot,
      view: photo.view,
      scenePrompt: null,
      sceneCheck: null,
      printConfirmed: false,
      sourceAsset: null,
      asset,
      createdAt: this.deps.clock.now(),
    };
  }
}
