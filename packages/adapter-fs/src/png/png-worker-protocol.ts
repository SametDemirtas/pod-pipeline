import { flattenPngFile, type FlattenJob } from './flatten-job.js';
import { rotatePngFile, type RotateJob } from './rotate-job.js';
import { scalePngFile, type ScaleJob } from './scale-job.js';

export type PngRequest =
  | { readonly type: 'scale'; readonly job: ScaleJob }
  | { readonly type: 'rotate'; readonly job: RotateJob }
  | { readonly type: 'flatten'; readonly job: FlattenJob }
  | { readonly type: 'stop' };

export type PngReply = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** The side of a channel the worker talks over: `parentPort` in a worker thread. */
export interface PngPort {
  on(event: 'message', listener: (request: PngRequest) => void): unknown;
  postMessage(reply: PngReply): void;
}

function run(request: Exclude<PngRequest, { type: 'stop' }>, signal: AbortSignal) {
  switch (request.type) {
    case 'scale':
      return scalePngFile(request.job, signal);
    case 'rotate':
      return rotatePngFile(request.job, signal);
    case 'flatten':
      return flattenPngFile(request.job, signal);
  }
}

/**
 * Runs the job the app sends, scaling, turning or flattening a PNG, until it
 * says stop. A worker works on one image: a second job while one runs is
 * refused rather than run alongside it.
 */
export function servePngJobs(port: PngPort): void {
  const stop = new AbortController();
  let busy = false;
  port.on('message', (request) => {
    if (request.type === 'stop') {
      stop.abort();
      return;
    }
    if (busy) {
      port.postMessage({ ok: false, message: 'the worker is already working on an image' });
      return;
    }
    busy = true;
    run(request, stop.signal)
      .finally(() => {
        busy = false;
      })
      .then(
        () => {
          port.postMessage({ ok: true });
        },
        (error: unknown) => {
          port.postMessage({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        },
      );
  });
}
