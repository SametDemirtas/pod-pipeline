import type { ImageMimeType } from '../catalog/model.js';

export interface FileToShare {
  readonly absolutePath: string;
  readonly mimeType: ImageMimeType;
  /** File name to use at the host, e.g. `01-mug-r2.png`. */
  readonly name: string;
}

export interface SharedFile {
  /** Address anyone holding it can download the file from, for a limited time. */
  readonly url: string;
  /** Removes the file from the host; safe to call more than once. */
  release(): Promise<void>;
}

/** Makes a local file reachable for a print provider without publishing it permanently. */
export interface FileHost {
  share(file: FileToShare): Promise<SharedFile>;
}
