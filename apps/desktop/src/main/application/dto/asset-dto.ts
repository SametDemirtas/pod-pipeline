import type { ImageAssetDto } from '@pod/contracts';
import type { ImageAsset } from '@pod/core';

export function toAssetDto(asset: ImageAsset): ImageAssetDto {
  return {
    storageKey: asset.storageKey,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byteSize,
  };
}
