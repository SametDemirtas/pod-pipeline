import type { Design, DesignView } from '../catalog/model.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { FileToShare } from '../ports/file-host.js';

/**
 * A revision of a design, the current one unless given, named so a provider's
 * file list stays readable.
 */
export function designFileToShare(
  design: DesignView,
  assets: AssetLocator,
  revision: Design = design,
): FileToShare {
  const { asset } = revision;
  const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
  return {
    absolutePath: assets.pathOf(asset.storageKey),
    mimeType: asset.mimeType,
    name: `${design.designKey}-r${revision.revision}.${extension}`,
  };
}
