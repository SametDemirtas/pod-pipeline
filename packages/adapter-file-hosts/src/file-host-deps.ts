import type { Clock, IdGenerator } from '@pod/core';
import type { FileSizeOf } from './file-size.js';
import type { SignalFor } from './timeouts.js';

/** What a file host is made with; `C` is its stored sign-in or keys. */
export interface FileHostDeps<C> {
  /** Resolves to `undefined` while the host is not connected. */
  readonly credentials: () => Promise<C | undefined>;
  readonly fetch: typeof fetch;
  readonly readFile: (absolutePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  /** Reads a file's size, so one too large is refused before it is read. */
  readonly fileSize?: FileSizeOf;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly signal?: SignalFor;
  /** Waits before a request is sent again; a timer by default. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
}
