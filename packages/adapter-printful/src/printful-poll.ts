import { classifyNetworkError, sleep } from '@pod/adapter-http';
import { PrintfulApiError } from './errors.js';
import { objectAt, type JsonObject } from './json.js';
import type { PrintfulClient } from './printful-client.js';

export interface PollOptions {
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
  /** Longest wait for Printful to finish. */
  readonly timeoutMs?: number;
}

export interface PollRequest<T> {
  readonly path: string;
  /** What the response is, for the error when it has an unexpected shape. */
  readonly what: string;
  /** The result once Printful is done, `undefined` while it works; throws when it failed. */
  readonly done: (state: JsonObject) => T | undefined;
  readonly timedOut: () => Error;
  readonly firstDelayMs: number;
  /** The delay grows by half each turn up to this. */
  readonly maxDelayMs: number;
}

/** Reads the state of work that keeps running at Printful until it is done. */
export class PrintfulPoller {
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(
    private readonly client: Pick<PrintfulClient, 'get' | 'signal'>,
    options: PollOptions = {},
  ) {
    this.sleep = options.sleep ?? sleep;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /** Stops, with the reason, as soon as the client's signal aborts, also while waiting. */
  async until<T>(request: PollRequest<T>): Promise<T> {
    const { signal } = this.client;
    const deadline = this.now() + this.timeoutMs;
    let delay = request.firstDelayMs;
    while (this.now() < deadline) {
      signal?.throwIfAborted();
      await this.sleep(Math.min(delay, deadline - this.now()), signal);
      delay = Math.min(delay * 1.5, request.maxDelayMs);
      const state = await this.read(request.path, request.what);
      const result = state && request.done(state);
      if (result !== undefined) return result;
    }
    throw request.timedOut();
  }

  /**
   * The state, or `undefined` when Printful was busy or out of reach for a
   * moment. Polling keeps its own schedule, so such a read only skips a turn;
   * a stopped one ends the polling.
   */
  private async read(path: string, what: string): Promise<JsonObject | undefined> {
    try {
      return objectAt(await this.client.get(path, { retry: false }), what);
    } catch (error) {
      if (this.client.signal?.aborted || !isTransient(error)) throw error;
      return undefined;
    }
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof PrintfulApiError) return error.status === 429 || error.status >= 500;
  return (
    error instanceof Error &&
    error.name !== 'AbortError' &&
    classifyNetworkError(error) !== undefined
  );
}
