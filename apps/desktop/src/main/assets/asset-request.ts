import { ASSET_PROTOCOL, THUMBNAIL_WIDTHS, type ThumbnailWidth } from '@pod/contracts';

export interface AssetRequest {
  readonly storageKey: string;
  /** `null` for the original file. */
  readonly width: ThumbnailWidth | null;
}

/** Reads `pod-asset://asset/<storage key>[?w=<width>]`; returns `null` for anything else. */
export function parseAssetRequest(url: string): AssetRequest | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${ASSET_PROTOCOL}:` || parsed.host !== 'asset') return null;

  let storageKey: string;
  try {
    storageKey = decodeURI(parsed.pathname.slice(1));
  } catch {
    return null;
  }
  if (!storageKey) return null;

  const widthParam = parsed.searchParams.get('w');
  if (widthParam === null) return { storageKey, width: null };
  const width = THUMBNAIL_WIDTHS.find((allowed) => String(allowed) === widthParam);
  return width ? { storageKey, width } : null;
}
