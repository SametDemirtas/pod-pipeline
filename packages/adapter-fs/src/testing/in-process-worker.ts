import { EventEmitter } from 'node:events';
import { MessageChannel } from 'node:worker_threads';
import { servePngJobs, type PngRequest } from '../png/png-worker-protocol.js';
import type { PngWorker } from '../png/worker-run.js';

/** A PNG worker on the test's own thread, talking over a real message channel. */
class InProcessWorker extends EventEmitter implements PngWorker {
  private readonly channel = new MessageChannel();

  constructor() {
    super();
    servePngJobs(this.channel.port2);
    this.channel.port1.on('message', (reply) => this.emit('message', reply));
  }

  postMessage(request: PngRequest): void {
    this.channel.port1.postMessage(request);
  }

  terminate(): Promise<number> {
    this.channel.port1.close();
    this.channel.port2.close();
    return Promise.resolve(0);
  }
}

export function inProcessWorker(): PngWorker {
  return new InProcessWorker();
}
