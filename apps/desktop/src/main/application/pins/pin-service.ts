import type {
  CatalogApi,
  DesignIdRequest,
  PinDto,
  PinIdRequest,
  BoardDto,
  PlanPinRequest,
  PublishPinNowRequest,
} from '@pod/contracts';
import type {
  ApprovePin,
  DesignId,
  Pin,
  PinLinks,
  PinPublisher,
  PinRepository,
  PlanPin,
  PublishPins,
  RemovePin,
} from '@pod/core';
import { PinInProgressError } from '../errors/pin-errors.js';
import { AppClosingError } from '../../shared/app-error.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toPinDto } from '../dto/pin-dtos.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import { SerialQueue } from '../../shared/serial-queue.js';

export type PinApi = Pick<CatalogApi, 'listBoards' | 'listPins' | 'proposePin'>;

export interface PinServiceDeps {
  readonly plan: Pick<PlanPin, 'execute'>;
  readonly publish: Pick<PublishPins, 'publishNow' | 'publishDue' | 'recoverInterrupted'>;
  readonly approve: Pick<ApprovePin, 'execute'>;
  readonly remove: Pick<RemovePin, 'execute'>;
  readonly pins: Pick<PinRepository, 'listForDesign'>;
  readonly publisher: Pick<PinPublisher, 'boards'>;
  /** Where a published pin is shown, for the window's link to it. */
  readonly links: PinLinks;
  /** Whether a Pinterest account is signed in, so due pins can go out. */
  readonly connected: () => Promise<boolean>;
  /** Tells every window that pins changed, e.g. after an assistant proposed one. */
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
}

/**
 * Pins for the seller and assistants. Assistants only propose; the seller
 * plans, approves and publishes in the window.
 */
export class PinService implements PinApi {
  // Making a pin image takes a moment; a double click must not make two pins. The seller
  // and assistants each have their own, so neither blocks the other.
  private readonly planner = new ExclusiveRunner(() => new PinInProgressError());
  private readonly proposer = new ExclusiveRunner(() => new PinInProgressError());
  // The schedule and the window publish, approve and remove pins one change at a time,
  // so a pin is never posted twice nor brought back after it was removed.
  private readonly changes = new SerialQueue();
  private closing = false;

  constructor(private readonly deps: PinServiceDeps) {}

  listBoards(): Promise<readonly BoardDto[]> {
    return this.deps.publisher.boards();
  }

  async listPins(request: DesignIdRequest): Promise<readonly PinDto[]> {
    return (await this.deps.pins.listForDesign(request.id as DesignId)).map(this.dto);
  }

  async proposePin(request: PlanPinRequest): Promise<PinDto> {
    const pin = await this.plan(this.proposer, request, true);
    this.deps.events.catalogChanged();
    return pin;
  }

  planPin(request: PlanPinRequest): Promise<PinDto> {
    return this.plan(this.planner, request, false);
  }

  approvePin(request: PinIdRequest): Promise<PinDto> {
    return this.change(async () => this.dto(await this.deps.approve.execute(request.id)));
  }

  publishPinNow(request: PublishPinNowRequest): Promise<PinDto> {
    return this.change(async () =>
      this.dto(await this.deps.publish.publishNow(request.id, request.confirmUnknown === true)),
    );
  }

  removePin(request: PinIdRequest): Promise<readonly PinDto[]> {
    return this.change(async () => {
      const designId = await this.deps.remove.execute(request.id);
      return this.listPins({ id: designId });
    });
  }

  /**
   * Publishes the pins whose time has come; nothing while Pinterest is not
   * connected. Stops between two pins once the app is closing.
   */
  publishDue(): Promise<readonly PinDto[]> {
    return this.change(async () => {
      if (!(await this.deps.connected())) return [];
      let done: Awaited<ReturnType<PublishPins['publishDue']>>;
      try {
        done = await this.deps.publish.publishDue(() => this.closing);
      } catch (error) {
        // An outage stops the batch, but the pins sent before it did change.
        this.deps.events.catalogChanged();
        throw error;
      }
      if (done.length > 0) this.deps.events.catalogChanged();
      return done.map(this.dto);
    });
  }

  /** Marks pins the app stopped publishing as failed; run once at start, before the schedule. */
  recoverInterrupted(): Promise<readonly PinDto[]> {
    return this.change(async () => (await this.deps.publish.recoverInterrupted()).map(this.dto));
  }

  /**
   * Refuses new changes and plans, and resolves once those under way are done,
   * so the database can close. Of a batch, only the pin being sent is waited for.
   */
  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([this.changes.idle(), this.planner.idle(), this.proposer.idle()]);
  }

  private readonly dto = (pin: Pin): PinDto => toPinDto(pin, this.deps.links);

  private change<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new AppClosingError());
    return this.changes.run(operation);
  }

  private plan(runner: ExclusiveRunner, request: PlanPinRequest, proposed: boolean) {
    if (this.closing) return Promise.reject(new AppClosingError());
    return runner.run(async () => {
      const { title, description, altText, publishAt, ...rest } = request;
      const pin = await this.deps.plan.execute({
        ...rest,
        text: { title, description, altText },
        publishAt: new Date(publishAt),
        proposed,
      });
      return this.dto(pin);
    });
  }
}
