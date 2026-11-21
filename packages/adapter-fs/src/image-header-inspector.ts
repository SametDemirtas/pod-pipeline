import { open, readFile } from 'node:fs/promises';
import { imageSize } from 'image-size';
import { imageSizeFromFile } from 'image-size/fromFile';
import { ImageTooLargeError, type ImageInfo, type ImageInspector } from '@pod/core';
import { mimeTypeOfDetected } from './image-formats.js';

/**
 * Largest JPEG read in full when its frame header sits past the first chunk.
 * Print files near the pixel limit can pass 64 MiB at high quality.
 */
const MAX_FULL_READ_BYTES = 256 * 1024 * 1024;

/**
 * Reads the file header to find the format and size, detecting the format
 * from the contents rather than the extension. I/O errors are thrown so the
 * caller can tell a locked file from one that simply is not an image.
 */
export class ImageHeaderInspector implements ImageInspector {
  async inspect(absolutePath: string): Promise<ImageInfo | undefined> {
    let size;
    try {
      size = await imageSizeFromFile(absolutePath);
    } catch (error) {
      if (isFileSystemError(error)) throw error;
      size = await this.readLargeJpeg(absolutePath);
    }
    if (!size) return undefined;

    const mimeType = mimeTypeOfDetected(size.type);
    const { width, height } = upright(size);
    if (!mimeType || width <= 0 || height <= 0) return undefined;
    return { mimeType, width, height };
  }

  /**
   * Photoshop and camera exports can carry megabytes of metadata before the
   * JPEG frame header, beyond the chunk the header reader looks at.
   */
  private async readLargeJpeg(absolutePath: string) {
    const { jpeg, size } = await jpegStart(absolutePath);
    if (!jpeg) return undefined;
    if (size > MAX_FULL_READ_BYTES) throw new ImageTooLargeError(absolutePath);
    try {
      return imageSize(await readFile(absolutePath));
    } catch (error) {
      if (isFileSystemError(error)) throw error;
      return undefined;
    }
  }
}

/** Whether the file starts with the JPEG marker, and its size in bytes. */
async function jpegStart(absolutePath: string): Promise<{ jpeg: boolean; size: number }> {
  const handle = await open(absolutePath, 'r');
  try {
    const marker = Buffer.alloc(2);
    await handle.read(marker, 0, 2, 0);
    const { size } = await handle.stat();
    return { jpeg: marker[0] === 0xff && marker[1] === 0xd8, size };
  } finally {
    await handle.close();
  }
}

function isFileSystemError(error: unknown): boolean {
  return typeof (error as NodeJS.ErrnoException | undefined)?.code === 'string';
}

/** JPEG files may store pixels sideways and rotate them with an EXIF tag. */
function upright(size: { width: number; height: number; orientation?: number | undefined }): {
  width: number;
  height: number;
} {
  const sideways = size.orientation !== undefined && size.orientation >= 5 && size.orientation <= 8;
  return sideways
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}
