import type { PreviewImage } from '@pod/core';

/** An image's bytes as base64, as the services take them inline. */
export function imageBase64(image: PreviewImage): string {
  return Buffer.from(image.data).toString('base64');
}
