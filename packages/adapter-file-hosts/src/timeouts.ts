/** Uploads carry the whole design; every other call is small. */
type RequestKind = 'upload' | 'request';

/**
 * Abort signal for one call, so a stalled connection can never hold a share
 * open forever; an upload is given its size in bytes.
 */
export type SignalFor = (kind: RequestKind, bytes?: number) => AbortSignal;

/** A minute, and a second more for every 64 KB, so a large print file has time on a slow line (about 0.5 Mbit/s). */
export function uploadTimeoutMs(bytes: number): number {
  return 60_000 + Math.ceil(bytes / (64 * 1024)) * 1000;
}

export const defaultSignal: SignalFor = (kind, bytes = 0) =>
  AbortSignal.timeout(kind === 'upload' ? uploadTimeoutMs(bytes) : 30_000);
