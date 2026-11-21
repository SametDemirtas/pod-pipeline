import { apiPath } from '@pod/adapter-http';
import {
  PrintFileMissingError,
  type PrintPreview,
  type PrintSync,
  type SyncedVariant,
  type VariantLink,
} from '@pod/core';
import { PrintfulApiError, PrintfulFileError } from './errors.js';
import { arrayAt, numberAt, objectAt, stringAt, type JsonObject } from './json.js';
import { PrintfulPoller, type PollOptions } from './printful-poll.js';
import { printfulPosition } from './printful-position.js';
import type { PrintfulClient } from './printful-client.js';
import { printfulId } from './printful-ids.js';

const POLL_MS = 2_000;

/**
 * Works with the products Printful imported from a connected Etsy shop. Printful
 * cannot create products in such a shop; it only links the ones the shop has.
 */
export class PrintfulPrintSync implements PrintSync {
  private readonly poller: PrintfulPoller;

  constructor(
    private readonly client: PrintfulClient,
    options: PollOptions = {},
  ) {
    this.poller = new PrintfulPoller(client, options);
  }

  async syncedVariants(
    marketplaceListingId: string,
  ): Promise<readonly SyncedVariant[] | undefined> {
    return (await this.variantsOf(marketplaceListingId))?.map((variant) => ({
      id: String(numberAt(variant['id'], 'sync variant id')),
      productId: stringAt(variant['external_id'], 'sync variant external id'),
    }));
  }

  /** Files Printful has not pictured yet, e.g. still being fetched, are left out. */
  async previews(marketplaceListingId: string): Promise<readonly PrintPreview[] | undefined> {
    const variants = await this.variantsOf(marketplaceListingId);
    if (!variants) return undefined;
    const previews = new Map<string, PrintPreview>();
    for (const variant of variants) {
      for (const entry of arrayAt(variant['files'] ?? [], 'sync variant files')) {
        const file = objectAt(entry, 'sync variant file');
        const url = file['preview_url'];
        if (typeof url !== 'string' || url === '' || previews.has(url)) continue;
        const thumbnail = file['thumbnail_url'];
        previews.set(url, {
          kind: typeof file['type'] === 'string' ? file['type'] : 'default',
          url,
          thumbnailUrl: typeof thumbnail === 'string' && thumbnail !== '' ? thumbnail : url,
        });
      }
    }
    return [...previews.values()];
  }

  /** `undefined` while Printful has not imported the listing yet. */
  private async variantsOf(marketplaceListingId: string): Promise<JsonObject[] | undefined> {
    let result: unknown;
    try {
      result = await this.client.get(apiPath`/sync/products/@${marketplaceListingId}`);
    } catch (error) {
      if (error instanceof PrintfulApiError && error.status === 404) return undefined;
      throw error;
    }
    return arrayAt(objectAt(result, 'sync product')['sync_variants'], 'sync variants').map(
      (entry) => objectAt(entry, 'sync variant'),
    );
  }

  async uploadPrintFile(url: string, name: string): Promise<string> {
    const created = objectAt(await this.client.post('/files', { url, filename: name }), 'file');
    const id = String(numberAt(created['id'], 'file id'));
    return (
      storedFile(created, id) ??
      this.poller.until({
        path: apiPath`/files/${id}`,
        what: 'file',
        done: (file) => storedFile(file, id),
        timedOut: () => new PrintfulFileError('Printful did not fetch the print file in time'),
        firstDelayMs: POLL_MS,
        maxDelayMs: POLL_MS,
      })
    );
  }

  /** Reports a print file Printful no longer has as missing, so it is uploaded again. */
  async linkVariant(syncedVariantId: string, link: VariantLink): Promise<void> {
    const { area, placement } = link;
    try {
      await this.client.put(apiPath`/sync/variant/${syncedVariantId}`, {
        variant_id: printfulId(link.variantId, 'variant'),
        files: [
          {
            type: area.placement,
            id: printfulId(link.fileId, 'file'),
            position: { ...printfulPosition(area, placement), limit_to_print_area: true },
          },
        ],
      });
    } catch (error) {
      if (isMissingFile(error)) {
        throw new PrintFileMissingError(link.fileId, { cause: error });
      }
      throw error;
    }
  }
}

/** Printful refuses a file id it does not have with 400 or 404, saying the file was not found. */
function isMissingFile(error: unknown): boolean {
  return (
    error instanceof PrintfulApiError &&
    (error.status === 400 || error.status === 404) &&
    /\bfile\b.*\bnot found\b/i.test(error.message)
  );
}

/** The file id once Printful stored the file, `undefined` while it is still fetching it. */
function storedFile(file: JsonObject, id: string): string | undefined {
  const status = stringAt(file['status'], 'file status');
  if (status === 'ok') return id;
  if (status === 'failed') {
    const reason = typeof file['message'] === 'string' ? file['message'] : 'no reason given';
    throw new PrintfulFileError(`Printful could not fetch the print file: ${reason}`);
  }
  return undefined;
}
