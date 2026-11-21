import { readFile as readFromDisk } from 'node:fs/promises';
import type { PinPublisher, PinBoard, PinToPublish } from '@pod/core';
import { mayHaveActed } from '@pod/adapter-http';
import {
  PinterestApiError,
  PinterestPublishUncertainError,
  PinterestSignInError,
  UnexpectedPinterestResponseError,
} from './errors.js';
import { arrayAt, idAt, objectAt, stringAt } from './json.js';
import type { PinterestClient } from './pinterest-client.js';

/** Pinterest returns at most 250 boards a page; more pages than this would be a loop. */
const BOARD_PAGE_SIZE = 250;
const MAX_BOARD_PAGES = 20;

function mayHaveCreated(error: unknown): boolean {
  if (error instanceof PinterestSignInError) return false;
  if (error instanceof UnexpectedPinterestResponseError) return true;
  return mayHaveActed(error, PinterestApiError);
}

/** The seller's boards and pins, through the Pinterest API v5. */
export class PinterestApi implements PinPublisher {
  constructor(
    private readonly client: PinterestClient,
    /** Reads the pin image to upload; the file system by default. */
    private readonly readFile: (absolutePath: string) => Promise<Uint8Array> = readFromDisk,
  ) {}

  async boards(): Promise<readonly PinBoard[]> {
    const boards: PinBoard[] = [];
    let bookmark: string | null = null;
    for (let page = 0; page < MAX_BOARD_PAGES; page++) {
      const query = new URLSearchParams({ page_size: String(BOARD_PAGE_SIZE) });
      if (bookmark) query.set('bookmark', bookmark);
      const body = objectAt(await this.client.get(`/boards?${query.toString()}`), 'boards');
      for (const item of arrayAt(body['items'], 'boards items')) {
        const board = objectAt(item, 'board');
        boards.push({
          id: idAt(board['id'], 'board id'),
          name: stringAt(board['name'], 'board name'),
        });
      }
      bookmark = typeof body['bookmark'] === 'string' && body['bookmark'] ? body['bookmark'] : null;
      if (!bookmark) return boards;
    }
    throw new UnexpectedPinterestResponseError('boards kept going past the last page');
  }

  /** The name of the signed-in account, shown in the app's settings. */
  async username(): Promise<string> {
    const account = objectAt(await this.client.get('/user_account'), 'user account');
    return stringAt(account['username'], 'username');
  }

  async publish(pin: PinToPublish): Promise<string> {
    const image = await this.readFile(pin.image.absolutePath);
    // Signed in first, so a failed sign-in is never taken for a pin that may exist; a token
    // refreshed after a 401 inside the request is told apart by its own error.
    await this.client.signIn();
    try {
      const created = objectAt(
        await this.client.post('/pins', {
          board_id: pin.boardId,
          title: pin.title,
          description: pin.description,
          alt_text: pin.altText,
          ...(pin.link === null ? {} : { link: pin.link }),
          media_source: {
            source_type: 'image_base64',
            content_type: pin.image.mimeType,
            data: Buffer.from(image.buffer, image.byteOffset, image.byteLength).toString('base64'),
          },
          // Pinterest asks for images that generative AI changed to be labelled.
          ...(pin.aiModified ? { ai_disclosures: { values: ['AI_MODIFIED'] } } : {}),
        }),
        'pin',
      );
      return idAt(created['id'], 'pin id');
    } catch (error) {
      throw mayHaveCreated(error) ? new PinterestPublishUncertainError(error) : error;
    }
  }
}
