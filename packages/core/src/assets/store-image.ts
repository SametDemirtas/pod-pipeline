import type { ImageAsset } from '../catalog/model.js';
import { ValidationError } from '../errors.js';
import type { TemporaryFile } from '../ports/downloads.js';
import type { AssetStore, ImageInspector } from '../ports/files.js';

export interface ImageStorage {
  readonly inspector: ImageInspector;
  readonly assets: AssetStore;
}

/**
 * Keeps a PNG or JPEG file in the asset store. `field` and `what` name the
 * file in the error when it is neither.
 */
async function storeImage(
  { inspector, assets }: ImageStorage,
  absolutePath: string,
  field: string,
  what: string,
): Promise<ImageAsset> {
  const image = await inspector.inspect(absolutePath);
  if (!image) throw new ValidationError(field, `${what} is not a PNG or JPEG image`);
  const stored = await assets.put(absolutePath, image.mimeType);
  return { ...stored, mimeType: image.mimeType, width: image.width, height: image.height };
}

/**
 * Removes a temporary file, ignoring a failure: a file left behind must not
 * turn work that succeeded into a failure, nor hide the error of one that failed.
 */
export async function disposeQuietly(file: TemporaryFile): Promise<void> {
  await file.dispose().catch(() => undefined);
}

/** Like {@link storeImage}, for a temporary file that is removed afterwards either way. */
export async function storeTemporaryImage(
  storage: ImageStorage,
  file: TemporaryFile,
  field: string,
  what: string,
): Promise<ImageAsset> {
  try {
    return await storeImage(storage, file.absolutePath, field, what);
  } finally {
    await disposeQuietly(file);
  }
}
