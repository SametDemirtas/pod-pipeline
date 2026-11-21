import type { TemporaryFile } from './downloads.js';

/** Tells long work to stop; an `AbortSignal` is one. */
export interface StopSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** A PNG written for a moment, with what it came out as. */
export interface WrittenPng extends TemporaryFile {
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}
