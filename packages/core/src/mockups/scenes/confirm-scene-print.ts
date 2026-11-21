import type { DesignId } from '../../catalog/model.js';
import { ValidationError } from '../../errors.js';
import type { MockupStore, SceneReviews } from '../../ports/mockups.js';
import type { Mockup } from '../mockup.js';
import { requireMockup } from '../require-mockup.js';

export interface ConfirmScenePrintInput {
  readonly designId: string;
  readonly mockupId: string;
  /** `false` takes a confirmation back. */
  readonly confirmed: boolean;
}

/** Records that the seller checked the print in a scene, which lets it into a listing. */
export class ConfirmScenePrint {
  constructor(
    private readonly mockups: Pick<MockupStore, 'listForDesign'> &
      Pick<SceneReviews, 'setConfirmed'>,
  ) {}

  async execute(input: ConfirmScenePrintInput): Promise<Mockup> {
    const designId = input.designId as DesignId;
    const scene = await requireMockup(this.mockups, designId, input.mockupId);
    if (scene.scenePrompt === null) {
      throw new ValidationError('mockupId', "the print provider's photos need no confirmation");
    }
    await this.mockups.setConfirmed(designId, scene.id, input.confirmed);
    // Read back, as a check that ran meanwhile may have changed the scene.
    return requireMockup(this.mockups, designId, scene.id);
  }
}
