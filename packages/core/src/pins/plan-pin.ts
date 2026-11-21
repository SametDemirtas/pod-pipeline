import { characterCount, PIN_TEXT_LIMITS, PIN_TIME_GRACE_MS } from '@pod/rules';
import { storeTemporaryImage } from '../assets/store-image.js';
import { requireDesign } from '../catalog/catalog-queries.js';
import { ValidationError } from '../errors.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { AssetLocator } from '../ports/downloads.js';
import type { AssetStore, ImageInspector } from '../ports/files.js';
import type { ListingRepository } from '../ports/listings.js';
import type { MarketplaceLinks } from '../ports/marketplace.js';
import type { MockupStore } from '../ports/mockups.js';
import { requirePublishablePhoto } from '../mockups/require-mockup.js';
import type { PinComposer, PinRepository } from '../ports/pins.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import type { Pin, PinId, PinText } from './pin.js';
import { listingLink } from './pin-link.js';

export interface PlanPinInput {
  readonly designId: string;
  readonly mockupId: string;
  readonly headline: string;
  readonly text: PinText;
  readonly boardId: string;
  readonly publishAt: Date;
  /** Assistants only propose pins; the seller approves them in the app. */
  readonly proposed: boolean;
}

export interface PlanPinDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly mockups: Pick<MockupStore, 'listForDesign'>;
  readonly listings: Pick<ListingRepository, 'findByDesign'>;
  readonly links: Pick<MarketplaceLinks, 'listingUrl'>;
  readonly composer: PinComposer;
  readonly inspector: ImageInspector;
  readonly assets: AssetStore & AssetLocator;
  readonly pins: Pick<PinRepository, 'save'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function checkText(field: string, value: string, max: number, required: boolean): string {
  const text = value.trim();
  if (required && !text) throw new ValidationError(field, 'is empty');
  if (characterCount(text) > max) {
    throw new ValidationError(field, `is longer than ${max} characters`);
  }
  return text;
}

/**
 * Makes the pin image from one of the design's photos and plans the pin. It
 * links to the design's listing once that is published.
 */
export class PlanPin {
  constructor(private readonly deps: PlanPinDeps) {}

  async execute(input: PlanPinInput): Promise<Pin> {
    const text: PinText = {
      title: checkText('title', input.text.title, PIN_TEXT_LIMITS.title, true),
      description: checkText(
        'description',
        input.text.description,
        PIN_TEXT_LIMITS.description,
        false,
      ),
      altText: checkText('altText', input.text.altText, PIN_TEXT_LIMITS.altText, false),
    };
    const headline = checkText('headline', input.headline, PIN_TEXT_LIMITS.headline, false);
    if (!/^\d+$/.test(input.boardId)) throw new ValidationError('boardId', 'is not a board id');
    if (Number.isNaN(input.publishAt.getTime())) {
      throw new ValidationError('publishAt', 'is not a time');
    }
    if (input.publishAt.getTime() < this.deps.clock.now().getTime() - PIN_TIME_GRACE_MS) {
      throw new ValidationError('publishAt', 'is in the past');
    }

    const { design } = await requireDesign(this.deps.query, input.designId);
    const photo = requirePublishablePhoto(
      await this.deps.mockups.listForDesign(design.id),
      input.mockupId,
      'mockupId',
      design.revision,
    );
    const listing = await this.deps.listings.findByDesign(design.id);

    const file = await this.deps.composer.compose({
      photo: {
        absolutePath: this.deps.assets.pathOf(photo.asset.storageKey),
        mimeType: photo.asset.mimeType,
      },
      headline,
    });
    const image = await storeTemporaryImage(this.deps, file, 'image', 'the pin image');

    const pin: Pin = {
      id: this.deps.ids.next() as PinId,
      designId: design.id,
      mockupId: photo.id,
      text,
      headline,
      boardId: input.boardId,
      link: listingLink(listing, this.deps.links),
      image,
      aiModified: photo.scenePrompt !== null,
      publishAt: input.publishAt,
      state: input.proposed ? 'proposed' : 'planned',
      publishedId: null,
      failure: null,
      failureCode: null,
      createdAt: this.deps.clock.now(),
    };
    await this.deps.pins.save(pin);
    return pin;
  }
}
