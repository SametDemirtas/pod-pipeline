import type { DesignId } from '../catalog/model.js';
import type { Pin, PinId, PinState } from '../pins/pin.js';
import type { LocalImage, TemporaryFile } from './downloads.js';

export interface PinImageRequest {
  readonly photo: LocalImage;
  /** Short words printed on the pin; empty for none. */
  readonly headline: string;
}

/** Lays a photo and a headline out as a tall pin image, 1000 × 1500 pixels. */
export interface PinComposer {
  compose(request: PinImageRequest): Promise<TemporaryFile>;
}

export interface PinBoard {
  readonly id: string;
  readonly name: string;
}

export interface PinToPublish {
  readonly boardId: string;
  readonly title: string;
  readonly description: string;
  readonly altText: string;
  readonly link: string | null;
  readonly image: LocalImage;
  readonly aiModified: boolean;
}

export interface PinPublisher {
  boards(): Promise<readonly PinBoard[]>;
  /** Creates the pin and resolves with the service's id for it. */
  publish(pin: PinToPublish): Promise<string>;
}

/** Where the service shows a published pin. */
export interface PinLinks {
  pinUrl(publishedId: string): string;
}

export interface PinRepository {
  save(pin: Pin): Promise<void>;
  get(id: PinId): Promise<Pin | undefined>;
  /** Soonest first. */
  listForDesign(designId: DesignId): Promise<readonly Pin[]>;
  /** Planned pins whose time has come, soonest first. */
  listDue(now: Date): Promise<readonly Pin[]>;
  /** Pins in one state, soonest first. */
  listByState(state: PinState): Promise<readonly Pin[]>;
  remove(id: PinId): Promise<void>;
}
