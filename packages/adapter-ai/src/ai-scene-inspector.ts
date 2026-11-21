import type { PreviewImage, SceneCheck, SceneInspector } from '@pod/core';
import { answerOf, seeingModel, type Expected } from './answers.js';
import type { ModelChoice } from './json-model.js';
import { SCENE_CHECK_SCHEMA, sceneCheckerSystem } from './scene-prompts.js';
import { isTextList } from './text-list.js';

const SCENE_CHECK: Expected<SceneCheck> = {
  subject: 'scene check',
  item: 'a scene check',
  read: ({ same, issues, unverifiable }) =>
    typeof same === 'boolean' && isTextList(issues) && isTextList(unverifiable)
      ? { same, issues, unverifiable }
      : undefined,
};

/** Compares a generated scene with its source photo with a model that reads images. */
export class AiSceneInspector implements SceneInspector {
  /** `language` is the seller's, e.g. `de`, which the issues are written in. */
  constructor(
    private readonly models: ModelChoice,
    private readonly language: () => Promise<string>,
  ) {}

  async compare(original: PreviewImage, scene: PreviewImage): Promise<SceneCheck> {
    const question = {
      system: sceneCheckerSystem(await this.language()),
      parts: [
        { text: 'Image 1, the original:' },
        { image: original },
        { text: 'Image 2, the generated scene:' },
        { image: scene },
        { text: 'Compare the product and its print in the two images.' },
      ],
      // Reading small letters twice is worth some thought.
      effort: 'medium',
      schema: SCENE_CHECK_SCHEMA,
    } as const;
    return answerOf(await seeingModel(this.models), question, SCENE_CHECK);
  }
}
