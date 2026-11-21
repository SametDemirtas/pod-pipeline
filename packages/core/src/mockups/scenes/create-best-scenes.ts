import type { DesignId } from '../../catalog/model.js';
import { DomainError } from '../../errors.js';
import type { MockupStore } from '../../ports/mockups.js';
import type { ProductDetails } from '../../ports/product-reader.js';
import type { SceneProblems } from '../../ports/scene-problems.js';
import type { Mockup } from '../mockup.js';
import { betterScene } from './better-scene.js';
import type { CompareScene } from './compare-scene.js';
import { checkedScenePrompt, type CreateScene, type CreateSceneInput } from './create-scene.js';
import type { DescribeProduct } from './describe-product.js';

export interface CreateBestScenesInput extends Omit<CreateSceneInput, 'details'> {
  /** Scenes made at once from the same request; of two, the better is kept. */
  readonly candidates: 1 | 2;
}

export interface CreatedScenes {
  readonly scenes: readonly Mockup[];
  /** Fewer scenes were made than asked for. */
  readonly candidateFailed: boolean;
}

export interface CreateBestScenesDeps {
  readonly describeProduct: Pick<DescribeProduct, 'execute'>;
  readonly createScene: Pick<CreateScene, 'prepare' | 'generate'>;
  readonly compare: Pick<CompareScene, 'execute'>;
  readonly mockups: Pick<MockupStore, 'remove'>;
  readonly problems: SceneProblems;
}

/**
 * Makes candidate scenes of one photo and keeps the better. Each scene is
 * kept before it is checked, so a failed check never loses a billed scene. Of
 * two candidates, the worse is removed once both were checked; unchecked,
 * both stay for the seller to choose.
 */
export class CreateBestScenes {
  constructor(private readonly deps: CreateBestScenesDeps) {}

  async execute(input: CreateBestScenesInput): Promise<CreatedScenes> {
    // A request that cannot make a scene must not pay for reading the product first.
    checkedScenePrompt(input.prompt);
    const details = await this.describeProduct(input);
    const made = await this.candidates({ ...input, details });
    const checked = await Promise.all(made.map((scene) => this.checked(input.designId, scene)));
    return {
      scenes: await this.keepBetter(input.designId, checked),
      candidateFailed: made.length < input.candidates,
    };
  }

  /**
   * Has the photo's product read before its first scene; scenes do without the
   * details when the read fails for any reason other than the request itself.
   * A failed read keeps nothing, so the photo's next scene asks, and bills, again.
   */
  private async describeProduct(input: CreateBestScenesInput): Promise<ProductDetails | null> {
    try {
      return await this.deps.describeProduct.execute(input);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.deps.problems.stepFailed(error);
      return null;
    }
  }

  /**
   * The scenes made, all generated at once. When one fails and another is
   * made, the one made is billed, so it is kept; with none made, the first
   * failure is passed on and the others are reported.
   */
  private async candidates(input: CreateBestScenesInput & CreateSceneInput): Promise<Mockup[]> {
    const prepared = await this.deps.createScene.prepare(input);
    const results = await Promise.allSettled(
      Array.from({ length: input.candidates }, () => this.deps.createScene.generate(prepared)),
    );
    const made = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failed = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    const [first, ...others] = failed;
    (made.length === 0 ? others : failed).forEach((error) => {
      this.deps.problems.stepFailed(error);
    });
    if (made.length === 0) throw first;
    return made;
  }

  /**
   * The scene with its check, or unchecked when the check fails for any
   * reason: the scene is already billed and kept, the seller confirms its
   * print either way, and checking again shows why a check fails.
   */
  private async checked(designId: string, scene: Mockup): Promise<Mockup> {
    try {
      return await this.deps.compare.execute({ designId, mockupId: scene.id });
    } catch (error) {
      this.deps.problems.stepFailed(error);
      return scene;
    }
  }

  /** Removes the worse of two checked candidates; keeps them all otherwise, and when removing fails. */
  private async keepBetter(designId: string, scenes: Mockup[]): Promise<Mockup[]> {
    const [first, second] = scenes;
    if (!first || !second) return scenes;
    const better = betterScene(first, second);
    if (!better) return scenes;
    try {
      await this.deps.mockups.remove(designId as DesignId, (better === first ? second : first).id);
      return [better];
    } catch (error) {
      this.deps.problems.removalFailed(error);
      return scenes;
    }
  }
}
