import type { QuarterTurn } from '../catalog/model.js';
import type { StopSignal, WrittenPng } from './work.js';

/** Turns images by a quarter, away from the main thread and without holding them in memory whole. */
export interface ImageRotator {
  /**
   * Writes the PNG at `source` turned `turn` degrees clockwise, as a PNG with
   * the same pixels and its width and height swapped; `signal` stops the work.
   */
  rotate(source: string, turn: QuarterTurn, signal?: StopSignal): Promise<WrittenPng>;
}
