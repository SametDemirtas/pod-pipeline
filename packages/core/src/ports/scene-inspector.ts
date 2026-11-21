import type { SceneCheck } from '../mockups/mockup.js';
import type { PreviewImage } from './previews.js';

/** Compares a generated scene with the photo it was made from. */
export interface SceneInspector {
  compare(original: PreviewImage, scene: PreviewImage): Promise<SceneCheck>;
}
