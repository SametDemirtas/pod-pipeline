import type { SceneShape } from '../mockups/scenes/scene-look.js';
import type { LocalImage, TemporaryFile } from './downloads.js';

export interface SceneRequest {
  /** The product photo the scene is built around, with the design already on it. */
  readonly image: LocalImage;
  readonly prompt: string;
  /** The photo's width to height. */
  readonly shape: SceneShape;
}

/** Turns a plain product photo into a styled scene, e.g. a mug on a kitchen table. */
export interface SceneGenerator {
  /** Resolves with the generated photo as a temporary file. */
  generate(request: SceneRequest): Promise<TemporaryFile>;
}
