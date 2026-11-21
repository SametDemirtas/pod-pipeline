/** A file written for a moment, e.g. a download or a generated image, until it is stored. */
export interface TemporaryFile {
  readonly absolutePath: string;
  /** Deletes the temporary file; safe to call more than once. */
  dispose(): Promise<void>;
}

/** An image on disk, as a service is handed it. */
export interface LocalImage {
  readonly absolutePath: string;
  readonly mimeType: string;
}

/** Fetches a file a provider produced, such as a rendered mockup, into a temporary file. */
export interface FileDownloader {
  download(url: string): Promise<TemporaryFile>;
}

/** Finds the file behind a key the asset store produced. */
export interface AssetLocator {
  pathOf(storageKey: string): string;
}
