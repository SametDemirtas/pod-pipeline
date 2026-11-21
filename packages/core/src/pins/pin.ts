import type { DesignId, ImageAsset } from '../catalog/model.js';
import type { MockupId } from '../mockups/mockup.js';

export type PinId = string & { readonly __brand: 'PinId' };

/**
 * `proposed` pins wait for the seller's approval, since an assistant planned
 * them; `planned` ones are published when their time comes. `publishing` is
 * recorded before Pinterest is asked, so an interrupted attempt is noticed.
 */
const PIN_STATES = ['proposed', 'planned', 'publishing', 'published', 'failed'] as const;
export type PinState = (typeof PIN_STATES)[number];

export function isPinState(value: string): value is PinState {
  return (PIN_STATES as readonly string[]).includes(value);
}

export interface PinText {
  /** Up to 100 characters. */
  readonly title: string;
  /** Up to 800 characters. */
  readonly description: string;
  /** Read aloud to people who cannot see the image; up to 500 characters. */
  readonly altText: string;
}

/** A Pinterest pin of a design, planned in the app and published at its time. */
export interface Pin {
  readonly id: PinId;
  readonly designId: DesignId;
  /** The photo the pin image was made from. */
  readonly mockupId: MockupId;
  readonly text: PinText;
  /** Words printed on the pin image. */
  readonly headline: string;
  readonly boardId: string;
  /** Where the pin leads, e.g. the Etsy listing; `null` for none. */
  readonly link: string | null;
  /** The pin image, 1000 × 1500 pixels. */
  readonly image: ImageAsset;
  /** The photo was generated, which Pinterest asks to disclose. */
  readonly aiModified: boolean;
  readonly publishAt: Date;
  readonly state: PinState;
  /** The pin's id on the service it was published to. */
  readonly publishedId: string | null;
  /** Why the last attempt failed. */
  readonly failure: string | null;
  /** A code for the failure, when the error had one, so it can be explained in any language. */
  readonly failureCode: string | null;
  readonly createdAt: Date;
}
