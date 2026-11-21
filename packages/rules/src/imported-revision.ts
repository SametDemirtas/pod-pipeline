import type { DesignDetailDto } from '@pod/contracts/client';

/**
 * The newest revision imported rather than made larger or turned in the app:
 * text and research for it, or for any later revision, still describe the artwork.
 */
export function importedRevisionOf(
  design: Pick<DesignDetailDto, 'revision' | 'revisions'>,
): number {
  const imported = design.revisions.find(
    (entry) => entry.upscaleModel === null && entry.rotation === null,
  );
  return imported?.revision ?? design.revision;
}
