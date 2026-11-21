import { MAX_REFERENCE_IMAGE_BYTES, MAX_REFERENCE_IMAGE_SIDE } from '@pod/contracts';
import type { ImageInspector, PreviewImage, TemporaryFile } from '@pod/core';
import { ReferenceImageUnreadableError } from '../errors/scene-errors.js';

export interface ReferenceImagesDeps {
  /** Shows the system file picker for a PNG or JPEG photo; `null` when the seller cancels. */
  readonly pickFile: () => Promise<string | null>;
  /** Writes a dropped photo, sent as base64, to a temporary file. */
  readonly writeDropped: (base64: string) => Promise<TemporaryFile>;
  /** The file's bytes; `null`, read no further, when it is larger than `maxBytes`. */
  readonly readFile: (path: string, maxBytes: number) => Promise<Uint8Array | null>;
  readonly inspector: ImageInspector;
}

/**
 * Photos the seller picks or drops to take a scene's style from. A dropped
 * photo is checked on disk like a picked one and removed again; neither is kept.
 */
export class ReferenceImages {
  constructor(private readonly deps: ReferenceImagesDeps) {}

  /** The dropped photo, or the one the seller picks; `null` when the picker was cancelled. */
  async take(dropped: string | undefined): Promise<PreviewImage | null> {
    if (dropped === undefined) {
      const path = await this.deps.pickFile();
      return path === null ? null : this.read(path);
    }
    const file = await this.deps.writeDropped(dropped);
    try {
      return await this.read(file.absolutePath);
    } finally {
      await file.dispose();
    }
  }

  private async read(path: string): Promise<PreviewImage> {
    const data = await this.deps.readFile(path, MAX_REFERENCE_IMAGE_BYTES);
    if (data === null) throw new ReferenceImageUnreadableError('tooLarge');
    const image = await this.deps.inspector.inspect(path);
    if (!image) throw new ReferenceImageUnreadableError('notAnImage');
    if (Math.max(image.width, image.height) > MAX_REFERENCE_IMAGE_SIDE) {
      throw new ReferenceImageUnreadableError('tooLarge');
    }
    return { data, mimeType: image.mimeType };
  }
}
