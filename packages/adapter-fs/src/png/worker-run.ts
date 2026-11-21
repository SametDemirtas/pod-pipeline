import type { StopSignal } from '@pod/core';
import { PngWorkFailedError, PngWorkStoppedError } from '../errors.js';
import type { PngReply, PngRequest } from './png-worker-protocol.js';

/** The worker thread an image job runs in; a `Worker` of `node:worker_threads`. */
export interface PngWorker {
  postMessage(request: PngRequest): void;
  once(event: 'message', listener: (reply: PngReply) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
}

/** Runs one job in a worker of its own and ends the worker, whatever the outcome. */
export async function runInWorker(
  startWorker: () => PngWorker,
  request: Exclude<PngRequest, { type: 'stop' }>,
  signal?: StopSignal,
): Promise<void> {
  // A stop that came while the job's file was being made has no worker to reach.
  if (signal?.aborted) throw new PngWorkStoppedError();
  const worker = startWorker();
  const stop = () => {
    worker.postMessage({ type: 'stop' });
  };
  signal?.addEventListener('abort', stop);
  try {
    const reply = await new Promise<PngReply>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      // A worker that dies without a word, e.g. out of memory, must not leave the job waiting.
      worker.once('exit', (code) => {
        reject(new PngWorkFailedError(`the worker stopped with code ${String(code)}`));
      });
      worker.postMessage(request);
    });
    if (signal?.aborted) throw new PngWorkStoppedError();
    if (!reply.ok) throw new PngWorkFailedError(reply.message);
  } finally {
    signal?.removeEventListener('abort', stop);
    await worker.terminate();
  }
}
