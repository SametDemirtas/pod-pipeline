import { join } from 'node:path';
import { FakeMarketSearch } from '@pod/core/testing';
import type { ServiceOptions } from '../composition/shared-parts.js';
import { ThumbnailCache } from '../assets/thumbnail-cache.js';
import { plainEncryption } from '../storage/plain-encryption.js';

/**
 * Options for services kept in `dir`, with nothing outside the test reached:
 * no pickers, no browser, no events. The scaling worker comes from the test,
 * as only composition tests may start the real one.
 */
export function serviceOptions(
  dir: string,
  startPngWorker: ServiceOptions['startPngWorker'],
  overrides: Partial<ServiceOptions> = {},
): ServiceOptions {
  return {
    dataDirectory: join(dir, 'data'),
    defaultSettings: { language: 'en' },
    events: {
      importProgress: () => undefined,
      catalogChanged: () => undefined,
      batchChanged: () => undefined,
      upscaleProgress: () => undefined,
    },
    encryption: plainEncryption,
    openExternal: () => Promise.resolve(),
    logError: () => undefined,
    marketSearch: new FakeMarketSearch(),
    renderPin: () => Promise.resolve(new Uint8Array()),
    pickFolder: () => Promise.resolve(null),
    pickKeywordFile: () => Promise.resolve(null),
    pickImageFile: () => Promise.resolve(null),
    pickSavePath: () => Promise.resolve(null),
    upscalerDirectory: join(dir, 'upscaler'),
    startPngWorker,
    thumbnails: new ThumbnailCache(join(dir, 'thumbnails'), {
      render: () => Promise.resolve(new Uint8Array()),
    }),
    bitmapCodec: {
      decodePng: () => ({ pixels: new Uint8Array(4), width: 1, height: 1 }),
      encodeJpeg: () => new Uint8Array([0xff, 0xd8]),
    },
    ...overrides,
  };
}
