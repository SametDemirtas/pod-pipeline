/** Largest side accepted on import; bigger files would exhaust memory when decoded. */
export const MAX_IMAGE_SIDE = 30_000;
/**
 * Largest pixel count accepted on import, for the same reason. Print files
 * stay well below it: a 12,000 × 12,000 image is 144 million pixels.
 */
export const MAX_IMAGE_PIXELS = 150_000_000;

/** The file looks like an image, but is too large to read far enough to find its size. */
export class ImageTooLargeError extends Error {
  constructor(absolutePath: string) {
    super(`${absolutePath} is too large to read its image size`);
    this.name = new.target.name;
  }
}
