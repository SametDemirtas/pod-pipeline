import { storeTemporaryImage } from '../../assets/store-image.js';
import { requireDesign } from '../../catalog/catalog-queries.js';
import { ValidationError } from '../../errors.js';
import type { DesignId } from '../../catalog/model.js';
import type { CatalogQuery } from '../../ports/catalog-repositories.js';
import type { AssetLocator } from '../../ports/downloads.js';
import type { AssetStore, ImageInspector } from '../../ports/files.js';
import type { MockupStore } from '../../ports/mockups.js';
import type { PrintCatalog } from '../../ports/print-provider.js';
import type { ProductDetails } from '../../ports/product-reader.js';
import type { SceneGenerator } from '../../ports/scene-generator.js';
import type { Clock, IdGenerator } from '../../ports/system.js';
import type { Mockup, MockupId } from '../mockup.js';
import { requireProviderPhoto } from '../require-mockup.js';
import { offeredLook, type SceneLook } from './scene-look.js';
import { scenePrompt, type SceneProduct } from './scene-prompt.js';
import { characterCount } from '@pod/rules';

export const MAX_SCENE_PROMPT_LENGTH = 1000;

export interface CreateSceneInput {
  readonly designId: string;
  /** The print provider's photo to build the scene around. */
  readonly mockupId: string;
  readonly prompt: string;
  /** Options the product's family is not offered are left at Auto. */
  readonly look: SceneLook;
  /** What {@link DescribeProduct} read the photo to show; `null` when it could not. */
  readonly details: ProductDetails | null;
}

/** A checked scene request with the photo and product it is made of. */
export interface PreparedScene {
  readonly source: Mockup;
  readonly product: SceneProduct;
  /** The request's words, trimmed. */
  readonly prompt: string;
  readonly look: SceneLook;
}

export interface CreateSceneDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly printCatalog: PrintCatalog;
  readonly mockups: Pick<MockupStore, 'listForDesign' | 'add'>;
  readonly generator: SceneGenerator;
  readonly inspector: ImageInspector;
  readonly assets: AssetStore & AssetLocator;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** The prompt with its spacing tidied; rejects one that is empty or too long. */
export function checkedScenePrompt(text: string): string {
  const prompt = text.trim().replace(/\s+/g, ' ');
  if (!prompt) throw new ValidationError('prompt', 'is empty');
  if (characterCount(prompt) > MAX_SCENE_PROMPT_LENGTH) {
    throw new ValidationError('prompt', `is longer than ${MAX_SCENE_PROMPT_LENGTH} characters`);
  }
  return prompt;
}

/**
 * Generates a scene from one of the design's product photos and
 * keeps it, not yet checked; {@link CompareScene} checks it.
 */
export class CreateScene {
  constructor(private readonly deps: CreateSceneDeps) {}

  async execute(input: CreateSceneInput): Promise<Mockup> {
    return this.generate(await this.prepare(input));
  }

  /** Checks the request and finds the photo and its product, once for any number of scenes. */
  async prepare(input: CreateSceneInput): Promise<PreparedScene> {
    const prompt = checkedScenePrompt(input.prompt);
    const designId = input.designId as DesignId;
    const source = await requireProviderPhoto(this.deps.mockups, designId, input.mockupId);
    const product = await this.productOf(source, input.details);
    return { source, product, prompt, look: offeredLook(product.familyId, input.look) };
  }

  /** Generates one scene of a prepared request and keeps it. */
  async generate({ source, product, prompt, look }: PreparedScene): Promise<Mockup> {
    const file = await this.deps.generator.generate({
      image: {
        absolutePath: this.deps.assets.pathOf(source.asset.storageKey),
        mimeType: source.asset.mimeType,
      },
      prompt: scenePrompt(product, prompt, look),
      shape: look.shape,
    });
    const asset = await storeTemporaryImage(this.deps, file, 'scene', 'the generated file');
    const scene: Mockup = {
      id: this.deps.ids.next() as MockupId,
      designId: source.designId,
      designRevision: source.designRevision,
      variantId: source.variantId,
      printArea: source.printArea,
      view: 'Scene',
      scenePrompt: prompt,
      sceneLook: look,
      sceneCheck: null,
      printConfirmed: false,
      sourceAsset: source.asset,
      asset,
      createdAt: this.deps.clock.now(),
    };
    await this.deps.mockups.add([scene]);
    return scene;
  }

  /**
   * The photo's product family, colour and details. The provider's product name
   * is left out, as its brand, model number or size could end up printed in the
   * scene.
   */
  private async productOf(source: Mockup, details: ProductDetails | null): Promise<SceneProduct> {
    const { design } = await requireDesign(this.deps.query, source.designId);
    const product = await this.deps.printCatalog
      .findProduct(design.familyId)
      .catch(() => undefined);
    const variant = product?.variants.find((candidate) => candidate.id === source.variantId);
    return { familyId: design.familyId, color: variant?.color ?? null, details };
  }
}
