import type { ImageMimeType } from '@pod/core';

interface ImageFormat {
  readonly mimeType: ImageMimeType;
  /** Extension used for stored copies. */
  readonly extension: string;
  /** Format name reported by the header reader. */
  readonly detectedAs: string;
}

/** The image formats the app accepts; every other list is derived from this one. */
const IMAGE_FORMATS: readonly ImageFormat[] = [
  { mimeType: 'image/png', extension: 'png', detectedAs: 'png' },
  { mimeType: 'image/jpeg', extension: 'jpg', detectedAs: 'jpg' },
];

export function extensionFor(mimeType: ImageMimeType): string {
  const format = IMAGE_FORMATS.find((candidate) => candidate.mimeType === mimeType);
  if (!format) throw new Error(`No image format for ${mimeType}`);
  return format.extension;
}

export function mimeTypeOfDetected(type: string | undefined): ImageMimeType | undefined {
  return IMAGE_FORMATS.find((format) => format.detectedAs === type)?.mimeType;
}

/** Storage keys look like `ab/<64 hex characters>.png`. */
export const STORAGE_KEY = new RegExp(
  `^[0-9a-f]{2}/[0-9a-f]{64}\\.(?:${IMAGE_FORMATS.map((format) => format.extension).join('|')})$`,
);
