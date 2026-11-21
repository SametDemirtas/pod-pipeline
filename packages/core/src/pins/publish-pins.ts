import {
  PIN_OUTCOME_UNKNOWN,
  PinOutcomeUnknownError,
  PinPhotoOutdatedError,
  ValidationError,
  errorCodeOf,
} from '../errors.js';
import { requirePublishablePhoto } from '../mockups/require-mockup.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { ListingRepository } from '../ports/listings.js';
import type { MarketplaceLinks } from '../ports/marketplace.js';
import type { MockupStore } from '../ports/mockups.js';
import type { PinRepository, PinPublisher } from '../ports/pins.js';
import type { Clock } from '../ports/system.js';
import type { Pin, PinState } from './pin.js';
import { listingLink } from './pin-link.js';
import { requirePin } from './require-pin.js';

export interface PublishPinsDeps {
  readonly pins: Pick<PinRepository, 'get' | 'listDue' | 'listByState' | 'save'>;
  /** The design's current revision, which the pin's photo must still show. */
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly mockups: Pick<MockupStore, 'listForDesign'>;
  readonly publisher: Pick<PinPublisher, 'publish'>;
  readonly listings: Pick<ListingRepository, 'findByDesign'>;
  readonly links: Pick<MarketplaceLinks, 'listingUrl'>;
  readonly assets: AssetLocator;
  readonly clock: Clock;
  /**
   * An error every other pin would meet too, such as a lost sign-in. The pin
   * stays as it was and a batch stops, instead of failing pin after pin.
   */
  readonly isOutage?: (error: unknown) => boolean;
  /**
   * An error after which Pinterest may have made the pin anyway, such as a
   * connection lost mid-request. The pin is marked so it is not simply sent again.
   */
  readonly isOutcomeUnknown?: (error: unknown) => boolean;
  /**
   * A pin that could not be put back after an outage; the outage is still what
   * is reported, and the pin, left `publishing`, is recovered on the next start.
   */
  readonly onSaveError?: (error: unknown) => void;
}

/** States a pin may be published from. */
const PUBLISHABLE: ReadonlySet<PinState> = new Set(['planned', 'failed']);

/** A pin after one attempt; an outage leaves it as it was and carries the error to stop on. */
type PublishOutcome = { pin: Pin; outage: false } | { pin: Pin; outage: true; error: unknown };

/**
 * Publishes pins on Pinterest, when due or when the seller asks. Callers run
 * one call at a time. Each due pin is still read again just before it is
 * published, so one changed since the batch was listed is never sent stale.
 */
export class PublishPins {
  constructor(private readonly deps: PublishPinsDeps) {}

  /**
   * Publishes every planned pin whose time has come, one after another. A
   * failure is recorded on its pin and does not stop the others. An outage
   * stops the batch and is thrown, leaving the rest planned; so does a pin of
   * unknown outcome, without throwing, as the next would likely end the same
   * way. `stopped` ends the batch early between two pins, e.g. when the app quits.
   */
  async publishDue(stopped: () => boolean = () => false): Promise<readonly Pin[]> {
    const due = await this.deps.pins.listDue(this.deps.clock.now());
    const done: Pin[] = [];
    for (const { id } of due) {
      if (stopped()) break;
      const pin = await this.deps.pins.get(id);
      if (pin?.state !== 'planned') continue;
      const result = await this.publish(pin);
      if (result.outage) throw result.error;
      done.push(result.pin);
      if (result.pin.failureCode === PIN_OUTCOME_UNKNOWN) break;
    }
    return done;
  }

  /**
   * Publishes one planned or failed pin right away. One that may already be on
   * Pinterest goes again only once the seller `confirmed` it.
   */
  async publishNow(id: string, confirmed = false): Promise<Pin> {
    const pin = await requirePin(this.deps.pins, id);
    if (pin.state === 'proposed') throw new ValidationError('state', 'approve the pin first');
    if (pin.failureCode === PIN_OUTCOME_UNKNOWN && !confirmed) {
      throw new PinOutcomeUnknownError(id);
    }
    if (!PUBLISHABLE.has(pin.state)) return pin;
    const result = await this.publish(pin);
    if (result.outage) throw result.error;
    return result.pin;
  }

  /**
   * Pins left `publishing` when the app stopped may or may not be on
   * Pinterest; they are marked failed with that reason rather than sent again.
   */
  async recoverInterrupted(): Promise<readonly Pin[]> {
    const interrupted = await this.deps.pins.listByState('publishing');
    const recovered: Pin[] = [];
    for (const pin of interrupted) {
      const failed: Pin = {
        ...pin,
        state: 'failed',
        failure: 'The app stopped while publishing; check the board before trying again',
        failureCode: PIN_OUTCOME_UNKNOWN,
      };
      await this.deps.pins.save(failed);
      recovered.push(failed);
    }
    return recovered;
  }

  private async publish(pin: Pin): Promise<PublishOutcome> {
    const outdated = await this.outdatedPhoto(pin);
    if (outdated) {
      return { pin: await this.fail(pin, outdated.message, outdated.code), outage: false };
    }
    // The listing may have gone live since the pin was planned.
    const link =
      listingLink(await this.deps.listings.findByDesign(pin.designId), this.deps.links) ?? pin.link;
    const publishing: Pin = { ...pin, link, state: 'publishing' };
    await this.deps.pins.save(publishing);
    let publishedId: string;
    try {
      publishedId = await this.send(publishing);
    } catch (error) {
      return this.failedAttempt(pin, publishing, error);
    }
    // The pin is on Pinterest now: a failed save must not mark it failed and invite a second
    // try. It stays `publishing`, which the next start reports as of unknown outcome.
    const published: Pin = {
      ...publishing,
      state: 'published',
      publishedId,
      failure: null,
      failureCode: null,
    };
    await this.deps.pins.save(published);
    return { pin: published, outage: false };
  }

  /** Sends the pin to Pinterest and returns the id it was given there. */
  private send(pin: Pin): Promise<string> {
    return this.deps.publisher.publish({
      boardId: pin.boardId,
      title: pin.text.title,
      description: pin.text.description,
      altText: pin.text.altText,
      link: pin.link,
      image: {
        absolutePath: this.deps.assets.pathOf(pin.image.storageKey),
        mimeType: pin.image.mimeType,
      },
      aiModified: pin.aiModified,
    });
  }

  /** An outage puts the pin back as it was, to be sent again; any other error marks it failed. */
  private async failedAttempt(pin: Pin, publishing: Pin, error: unknown): Promise<PublishOutcome> {
    if (this.deps.isOutage?.(error)) {
      await this.deps.pins.save(pin).catch((saveError: unknown) => {
        this.deps.onSaveError?.(saveError);
      });
      return { pin, outage: true, error };
    }
    const failureCode = this.deps.isOutcomeUnknown?.(error)
      ? PIN_OUTCOME_UNKNOWN
      : errorCodeOf(error);
    const failure = error instanceof Error ? error.message : String(error);
    return { pin: await this.fail(publishing, failure, failureCode), outage: false };
  }

  private async fail(pin: Pin, failure: string, failureCode: Pin['failureCode']): Promise<Pin> {
    const failed: Pin = { ...pin, state: 'failed', failure, failureCode };
    await this.deps.pins.save(failed);
    return failed;
  }

  /**
   * Why the photo the pin was made from may no longer be published, as the
   * artwork may have been imported again or the scene's confirmation taken
   * back since the pin was planned.
   */
  private async outdatedPhoto(pin: Pin): Promise<PinPhotoOutdatedError | undefined> {
    const details = await this.deps.query.getDesign(pin.designId);
    if (!details) return new PinPhotoOutdatedError(pin.id, 'the design is gone');
    const photos = await this.deps.mockups.listForDesign(pin.designId);
    try {
      requirePublishablePhoto(photos, pin.mockupId, 'mockupId', details.design.revision);
      return undefined;
    } catch (error) {
      return new PinPhotoOutdatedError(pin.id, (error as Error).message);
    }
  }
}
