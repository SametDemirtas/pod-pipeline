import { pathToFileURL } from 'node:url';
import { nativeImage, net, protocol } from 'electron';
import { ASSET_PROTOCOL } from '@pod/contracts';
import { parseAssetRequest } from './asset-request.js';
import type { ThumbnailCache, ThumbnailRenderer } from './thumbnail-cache.js';
import type { BitmapCodec } from './thumbnail-previews.js';

/** Must run before the app is ready so the scheme can be fetched like https. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Scales images with Electron; an image it cannot decode is an error, never an empty file. */
export const nativeThumbnailRenderer: ThumbnailRenderer = {
  render: (sourcePath, width) => {
    const image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) return Promise.reject(new Error(`Cannot decode ${sourcePath}`));
    return Promise.resolve(image.resize({ width, quality: 'good' }).toPNG());
  },
};

/** Decodes and encodes with Electron, which keeps pixels premultiplied like Chromium. */
export const nativeBitmapCodec: BitmapCodec = {
  decodePng: (png) => {
    const image = nativeImage.createFromBuffer(Buffer.from(png));
    if (image.isEmpty()) throw new Error('Cannot decode the thumbnail');
    const { width, height } = image.getSize();
    return { pixels: image.toBitmap(), width, height };
  },
  encodeJpeg: ({ pixels, width, height }, quality) =>
    nativeImage.createFromBitmap(Buffer.from(pixels), { width, height }).toJPEG(quality),
};

export interface AssetProtocolDeps {
  /** Absolute path of a stored asset; throws for keys outside the store. */
  readonly pathOf: (storageKey: string) => string;
  readonly thumbnails: ThumbnailCache;
}

/** Serves stored assets and their thumbnails to the window. */
export function handleAssetProtocol({ pathOf, thumbnails }: AssetProtocolDeps): void {
  protocol.handle(ASSET_PROTOCOL, async (request) => {
    const asset = parseAssetRequest(request.url);
    if (!asset) return new Response(null, { status: 400 });

    let file: string;
    try {
      file = pathOf(asset.storageKey);
      if (asset.width) file = await thumbnails.get(asset.storageKey, file, asset.width);
    } catch {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}
