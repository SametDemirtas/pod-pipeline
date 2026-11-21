import type { DesignId } from '../../catalog/model.js';
import { ValidationError } from '../../errors.js';
import type { ImagePreviews } from '../../ports/previews.js';
import type { MockupStore, SceneReviews } from '../../ports/mockups.js';
import type { SceneInspector } from '../../ports/scene-inspector.js';
import type { Mockup } from '../mockup.js';
import { requireMockup } from '../require-mockup.js';

/** Small print is where changes hide, so the check sees more pixels than other readers. */
export const CHECK_PREVIEW_SIDE = 1568;

export interface CompareSceneInput {
  readonly designId: string;
  readonly mockupId: string;
}

export interface CompareSceneDeps {
  readonly mockups: Pick<MockupStore, 'listForDesign'> & Pick<SceneReviews, 'saveCheck'>;
  readonly previews: ImagePreviews;
  readonly inspector: SceneInspector;
}

/**
 * Has the inspector compare a stored scene with the photo it was made from and
 * keeps the result. The seller's confirmation stays unless the print is found
 * changed; then the seller looks again.
 */
export class CompareScene {
  constructor(private readonly deps: CompareSceneDeps) {}

  async execute(input: CompareSceneInput): Promise<Mockup> {
    const designId = input.designId as DesignId;
    const scene = await requireMockup(this.deps.mockups, designId, input.mockupId);
    if (scene.scenePrompt === null) {
      throw new ValidationError('mockupId', "the print provider's photos need no check");
    }
    if (!scene.sourceAsset) {
      throw new ValidationError('mockupId', 'the photo this scene was made from is not known');
    }
    const { previews } = this.deps;
    const [original, generated] = await Promise.all([
      previews.preview(scene.sourceAsset, CHECK_PREVIEW_SIDE),
      previews.preview(scene.asset, CHECK_PREVIEW_SIDE),
    ]);
    const check = await this.deps.inspector.compare(original, generated);
    await this.deps.mockups.saveCheck(designId, scene.id, check);
    // Read back, as the seller may have changed the confirmation meanwhile.
    return requireMockup(this.deps.mockups, designId, scene.id);
  }
}
