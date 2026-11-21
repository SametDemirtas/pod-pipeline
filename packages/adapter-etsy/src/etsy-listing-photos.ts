import { readFile as readFromDisk } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ImageFlattener, ListingPhoto, LocalImage } from '@pod/core';
import { apiPath } from '@pod/adapter-http';
import type { EtsyHttp } from './etsy-client.js';
import { EtsyApiError } from './errors.js';
import { idAt, resultsOf, stringAt, type JsonObject } from './json.js';

export interface EtsyListingPhotosOptions {
  /** Reads a photo to upload; the file system by default. */
  readonly readFile?: (absolutePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Lays see-through photos onto white before they are sent, as Etsy shows a
   * transparent background as black; without it photos go as they are.
   */
  readonly flattener?: ImageFlattener | undefined;
}

/** A photo read and ready to send. */
interface Upload {
  readonly name: string;
  readonly image: Blob;
}

/** Uploads, replaces and reads the photos of a listing in the signed-in seller's shop. */
export class EtsyListingPhotos {
  private readonly readFile: (absolutePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  private readonly flattener: ImageFlattener | undefined;

  constructor(
    private readonly client: Pick<EtsyHttp, 'get' | 'post' | 'delete' | 'shopId'>,
    options: EtsyListingPhotosOptions = {},
  ) {
    this.readFile =
      options.readFile ??
      (async (absolutePath) => new Uint8Array(await readFromDisk(absolutePath)));
    this.flattener = options.flattener;
  }

  async addImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    const uploads = await this.prepare(images);
    await this.upload(await this.client.shopId(), listingId, uploads);
  }

  async replaceImages(listingId: string, images: readonly LocalImage[]): Promise<void> {
    // Every photo is read first, so one that cannot be leaves the old ones in place.
    const uploads = await this.prepare(images);
    const shop = await this.client.shopId();
    const old = await this.imageIds(listingId);
    // Etsy refuses to delete a listing's last photo, so one old photo stays
    // until the first new one is up; the rest go first, as a listing holds at most ten.
    const kept = old.at(-1);
    for (const imageId of old.slice(0, -1)) await this.deleteImage(shop, listingId, imageId);
    await this.upload(shop, listingId, uploads.slice(0, 1));
    if (kept !== undefined) await this.deleteImage(shop, listingId, kept);
    await this.upload(shop, listingId, uploads.slice(1), 1);
  }

  private async deleteImage(shop: string, listingId: string, imageId: string): Promise<void> {
    try {
      await this.client.delete(apiPath`/shops/${shop}/listings/${listingId}/images/${imageId}`);
    } catch (error) {
      // Already gone, e.g. removed by an earlier try that broke off.
      if (!(error instanceof EtsyApiError) || error.status !== 404) throw error;
    }
  }

  async photos(listingId: string): Promise<readonly ListingPhoto[]> {
    const images = resultsOf(
      await this.client.get(apiPath`/listings/${listingId}/images`),
      'listing image',
    );
    return [...images]
      .sort((a, b) => rankOf(a) - rankOf(b))
      .map((image) => ({
        url: stringAt(image['url_fullxfull'], 'listing image url'),
        thumbnailUrl: stringAt(image['url_570xN'], 'listing image thumbnail url'),
        width: sizeOf(image['full_width']),
        height: sizeOf(image['full_height']),
      }));
  }

  private async imageIds(listingId: string): Promise<string[]> {
    const images = resultsOf(
      await this.client.get(apiPath`/listings/${listingId}/images`),
      'listing image',
    );
    return images.map((image) => idAt(image['listing_image_id'], 'listing image id'));
  }

  /** Reads the photos, each laid onto white first when it may be see-through. */
  private async prepare(images: readonly LocalImage[]): Promise<Upload[]> {
    const uploads: Upload[] = [];
    for (const image of images) {
      const flat = await this.flattener?.flatten(image);
      try {
        const sent = flat ?? image;
        const bytes = await this.readFile(sent.absolutePath);
        uploads.push({ name: fileName(image), image: new Blob([bytes], { type: sent.mimeType }) });
      } finally {
        await flat?.dispose();
      }
    }
    return uploads;
  }

  /** `before` is how many of the chosen photos are already up, ahead of these. */
  private async upload(
    shop: string,
    listingId: string,
    uploads: readonly Upload[],
    before = 0,
  ): Promise<void> {
    const path = apiPath`/shops/${shop}/listings/${listingId}/images`;
    // One at a time, so the ranks follow the chosen order.
    for (const [index, upload] of uploads.entries()) {
      const form = new FormData();
      form.append('image', upload.image, upload.name);
      form.append('rank', String(before + index + 1));
      await this.client.post(path, { multipart: form });
    }
  }
}

function fileName(image: LocalImage): string {
  const extension = image.mimeType === 'image/png' ? '.png' : '.jpg';
  const name = basename(image.absolutePath);
  return name.includes('.') ? name : `${name}${extension}`;
}

/** Etsy ranks a listing's photos from 1, the main photo; one without a rank goes last. */
function rankOf(image: JsonObject): number {
  const rank = image['rank'];
  return typeof rank === 'number' ? rank : Number.MAX_SAFE_INTEGER;
}

/** A photo's pixel size, which Etsy leaves out for some older photos. */
function sizeOf(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}
