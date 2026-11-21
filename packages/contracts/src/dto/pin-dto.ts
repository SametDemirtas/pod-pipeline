import type { ImageAssetDto } from './catalog-dto.js';

export interface BoardDto {
  readonly id: string;
  readonly name: string;
}

/** `proposed` pins wait for the seller's approval; `planned` ones go out at `publishAt`. */
export const PIN_STATES = ['proposed', 'planned', 'publishing', 'published', 'failed'] as const;
export type PinState = (typeof PIN_STATES)[number];

export interface PinDto {
  readonly id: string;
  readonly designId: string;
  readonly mockupId: string;
  readonly title: string;
  readonly description: string;
  readonly altText: string;
  readonly headline: string;
  readonly boardId: string;
  /** Where the pin leads, e.g. the Etsy listing; `null` for none. */
  readonly link: string | null;
  /** The pin image, 1000 × 1500 pixels. */
  readonly image: ImageAssetDto;
  /** The photo was generated, which the pin discloses on Pinterest. */
  readonly aiModified: boolean;
  readonly publishAt: string;
  readonly state: PinState;
  /** The pin on Pinterest once published. */
  readonly publishedUrl: string | null;
  /** Why the last attempt to publish failed. */
  readonly failure: string | null;
  /** The API error code of that failure, when it had one. */
  readonly failureCode: string | null;
  readonly createdAt: string;
}
