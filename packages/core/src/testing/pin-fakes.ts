import type { DesignId } from '../catalog/model.js';
import type { Pin, PinId, PinState } from '../pins/pin.js';
import type {
  PinComposer,
  PinImageRequest,
  PinRepository,
  PinPublisher,
  PinBoard,
  PinToPublish,
} from '../ports/pins.js';
import type { TemporaryFile } from '../ports/downloads.js';
import type { FakeSourceFolder } from './fakes.js';

/** Writes a pin image named after the headline into the fake folder. */
export class FakePinComposer implements PinComposer {
  readonly requests: PinImageRequest[] = [];

  constructor(private readonly folder: FakeSourceFolder) {}

  compose(request: PinImageRequest): Promise<TemporaryFile> {
    this.requests.push(request);
    const relativePath = `pins/${request.headline || 'plain'}.png`;
    this.folder.write({
      relativePath,
      content: `pin:${request.headline}`,
      image: { mimeType: 'image/png', width: 1000, height: 1500 },
    });
    return Promise.resolve({
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    });
  }
}

export class FakePinPublisher implements PinPublisher {
  readonly published: PinToPublish[] = [];
  failWith: Error | undefined;

  boards(): Promise<readonly PinBoard[]> {
    return Promise.resolve([
      { id: '5001', name: 'Halloween mugs' },
      { id: '5002', name: 'Cozy gifts' },
    ]);
  }

  publish(pin: PinToPublish): Promise<string> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.published.push(pin);
    return Promise.resolve(`pin-${this.published.length}`);
  }
}

export class InMemoryPins implements PinRepository {
  private readonly byId = new Map<string, Pin>();

  save(pin: Pin): Promise<void> {
    this.byId.set(pin.id, pin);
    return Promise.resolve();
  }

  get(id: PinId): Promise<Pin | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  listForDesign(designId: DesignId): Promise<readonly Pin[]> {
    return Promise.resolve(
      soonest([...this.byId.values()].filter((pin) => pin.designId === designId)),
    );
  }

  listDue(now: Date): Promise<readonly Pin[]> {
    return Promise.resolve(
      soonest(
        [...this.byId.values()].filter(
          (pin) => pin.state === 'planned' && pin.publishAt.getTime() <= now.getTime(),
        ),
      ),
    );
  }

  listByState(state: PinState): Promise<readonly Pin[]> {
    return Promise.resolve(soonest([...this.byId.values()].filter((pin) => pin.state === state)));
  }

  remove(id: PinId): Promise<void> {
    this.byId.delete(id);
    return Promise.resolve();
  }
}

function soonest(pins: Pin[]): Pin[] {
  return pins.sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
}
