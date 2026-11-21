import type { Size } from '../print/placement.js';
import type { StopSignal, WrittenPng } from './work.js';

/** Makes images smaller without holding them in memory whole. */
export interface ImageScaler {
  /**
   * Writes the PNG at `source` scaled to `size`, as a PNG compressed as far as
   * it goes; `signal` stops the work.
   */
  scale(source: string, size: Size, signal?: StopSignal): Promise<WrittenPng>;
}
