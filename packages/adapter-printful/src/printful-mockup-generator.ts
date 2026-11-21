import { apiPath } from '@pod/adapter-http';
import type {
  GeneratedMockup,
  MockupGenerator,
  MockupOrientation,
  MockupOrientationQuery,
  MockupRequest,
} from '@pod/core';
import { PrintfulMockupError } from './errors.js';
import { arrayAt, objectAt, stringAt, type JsonObject } from './json.js';
import { PrintfulPoller, type PollOptions } from './printful-poll.js';
import { printfulId } from './printful-ids.js';
import { printfulPosition } from './printful-position.js';
import type { PrintfulClient } from './printful-client.js';

/**
 * Printful's styles of photo that are left out: premium ones are for paying
 * subscribers of Printful's design maker.
 */
const SKIPPED_STYLE = /premium/i;

/** Renders product photos with Printful's mockup generator. */
export class PrintfulMockupGenerator implements MockupGenerator {
  private readonly poller: PrintfulPoller;
  /** Each product's printfiles answer, per orientation asked for, read once while the app runs. */
  private readonly printfiles = new Map<string, Promise<JsonObject>>();

  constructor(
    private readonly client: Pick<PrintfulClient, 'get' | 'post' | 'signal'>,
    options: PollOptions = {},
  ) {
    this.poller = new PrintfulPoller(client, options);
  }

  async generate(request: MockupRequest): Promise<readonly GeneratedMockup[]> {
    const body = taskBody(request);
    // The styles only add photos, so the task goes without them when they cannot be read.
    const styles = await this.printfilesOf(request.productId, request.orientation)
      .then(stylesOf)
      .catch((error: unknown) => {
        this.passOnCancel(error);
        return [];
      });
    const created = await this.client.post(
      apiPath`/mockup-generator/create-task/${request.productId}`,
      styles.length > 0 ? { ...body, option_groups: [...styles] } : body,
    );
    const taskKey = stringAt(objectAt(created, 'created task')['task_key'], 'task key');
    return this.poller.until({
      path: apiPath`/mockup-generator/task?task_key=${taskKey}`,
      what: 'task',
      done: finishedMockups,
      timedOut: () => new PrintfulMockupError('Printful did not finish the mockups in time'),
      firstDelayMs: 2_000,
      maxDelayMs: 10_000,
    });
  }

  /**
   * Whether the variant's print file for the area may be turned (`can_rotate`
   * in the printfiles answer for that orientation). Printful then makes every
   * photo in the orientation of the position's area, so the area is sent
   * turned rather than asked for by name. A product Printful refuses the
   * orientation for, or an answer that cannot be read, counts as no.
   */
  async supportsOrientation(query: MockupOrientationQuery): Promise<boolean> {
    try {
      const printfiles = await this.printfilesOf(query.productId, query.orientation);
      return canRotate(printfiles, printfulId(query.variantId, 'variant'), query.placement);
    } catch (error) {
      this.passOnCancel(error);
      return false;
    }
  }

  private passOnCancel(error: unknown): void {
    this.client.signal?.throwIfAborted();
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
  }

  /**
   * The product's printfiles answer, for wall art products in the given
   * orientation. A failed read is not kept, so the next mockups ask again.
   */
  private printfilesOf(productId: string, orientation?: MockupOrientation): Promise<JsonObject> {
    const key = `${productId}:${orientation ?? ''}`;
    let printfiles = this.printfiles.get(key);
    if (!printfiles) {
      const path = orientation
        ? apiPath`/mockup-generator/printfiles/${productId}?orientation=${orientation}`
        : apiPath`/mockup-generator/printfiles/${productId}`;
      printfiles = this.client.get(path).then((answer) => objectAt(answer, 'printfiles'));
      this.printfiles.set(key, printfiles);
      printfiles.catch(() => {
        this.printfiles.delete(key);
      });
    }
    return printfiles;
  }
}

/**
 * The product's styles of photo (option groups in the printfiles answer),
 * such as a flat view and lifestyle scenes. They are asked for by name: a
 * task without them made a single photo of a throw blanket.
 */
function stylesOf(printfiles: JsonObject): readonly string[] {
  const groups = printfiles['option_groups'];
  if (groups === undefined || groups === null) return [];
  return arrayAt(groups, 'option groups').filter(
    (group): group is string =>
      typeof group === 'string' && group.trim() !== '' && !SKIPPED_STYLE.test(group),
  );
}

/** Whether the print file the variant uses for `placement` may be turned. */
function canRotate(printfiles: JsonObject, variantId: number, placement: string): boolean {
  const variant = arrayAt(printfiles['variant_printfiles'], 'variant printfiles')
    .map((entry) => objectAt(entry, 'variant printfile'))
    .find((entry) => entry['variant_id'] === variantId);
  const placements = variant?.['placements'];
  if (typeof placements !== 'object' || placements === null) return false;
  const printfileId = (placements as JsonObject)[placement];
  if (printfileId === undefined) return false;
  return arrayAt(printfiles['printfiles'], 'printfiles').some((entry) => {
    const file = objectAt(entry, 'printfile');
    return file['printfile_id'] === printfileId && file['can_rotate'] === true;
  });
}

function finishedMockups(task: JsonObject): GeneratedMockup[] | undefined {
  const status = stringAt(task['status'], 'task status');
  if (status === 'completed') {
    const mockups = mockupsOf(task);
    // Taken as the new photos, an empty list would wipe the earlier ones.
    if (mockups.length === 0) throw new PrintfulMockupError('Printful made no mockups');
    return mockups;
  }
  if (status === 'failed') {
    const reason = typeof task['error'] === 'string' ? task['error'] : 'no reason given';
    throw new PrintfulMockupError(`Printful could not create the mockups: ${reason}`);
  }
  return undefined;
}

function taskBody(request: MockupRequest): JsonObject {
  const { area, placement } = request;
  return {
    variant_ids: request.variantIds.map((id) => printfulId(id, 'variant')),
    // A PNG keeps the background around the product transparent, which Etsy
    // shows as black; a JPEG lies on white and is far smaller.
    format: request.lossless === true ? 'png' : 'jpg',
    files: [
      {
        placement: area.placement,
        image_url: request.imageUrl,
        position: printfulPosition(area, placement),
      },
    ],
  };
}

function mockupsOf(task: JsonObject): GeneratedMockup[] {
  return arrayAt(task['mockups'], 'mockups').flatMap((entry) => {
    const mockup = objectAt(entry, 'mockup');
    const main = {
      url: stringAt(mockup['mockup_url'], 'mockup url'),
      // Printful titles the extra views but not the main one, which shows the area printed on.
      view: stringAt(mockup['placement'], 'mockup placement'),
    };
    const extra = mockup['extra'];
    const extras = extra === undefined || extra === null ? [] : arrayAt(extra, 'extras');
    return [
      main,
      ...extras.map((item) => {
        const extra = objectAt(item, 'extra mockup');
        return {
          url: stringAt(extra['url'], 'extra url'),
          view: stringAt(extra['title'], 'extra title'),
        };
      }),
    ];
  });
}
