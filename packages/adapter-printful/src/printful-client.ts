import {
  readJsonResponse,
  retryAfterSeconds,
  sendWithRetries,
  sleep,
  withTimeout,
  type JsonObject,
} from '@pod/adapter-http';
import { PrintfulApiError, PrintfulNotConnectedError } from './errors.js';
import { objectAt } from './json.js';

export const PRINTFUL_API = 'https://api.printful.com';
/** Printful's Cloudflare rejects default agents such as Python's with 403 (error 1010). */
const USER_AGENT = 'pod-pipeline';

export interface PrintfulClientOptions {
  readonly fetch: typeof fetch;
  /** Resolves to `undefined` while no token is saved. */
  readonly token: () => Promise<string | undefined>;
  /** Waits out a rate limit; given the client's signal, so a cancel does not sit out the wait. */
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Stops every request, e.g. when the seller cancels; each also has its own timeout. */
  readonly signal?: AbortSignal;
  /** How often a rate-limited request is tried again before giving up. */
  readonly maxRetries?: number;
}

/** Printful's mockup generator states the wait only in the body, typically a minute. */
const DEFAULT_RETRY_SECONDS = 60;
/** A longer wait means a daily limit is used up; better to say so than to hang. */
const MAX_WAIT_SECONDS = 60;

/** Calls the Printful v1 API and returns the `result` of its response envelope. */
export class PrintfulClient {
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: PrintfulClientOptions) {
    this.sleep = options.sleep ?? sleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /** The signal that stops every request, for callers that wait between them. */
  get signal(): AbortSignal | undefined {
    return this.options.signal;
  }

  /** `retry: false` fails on the first rate limit, for callers that keep their own schedule. */
  get(path: string, { retry = true }: { retry?: boolean } = {}): Promise<unknown> {
    return this.send('GET', path, undefined, retry ? this.maxRetries : 0);
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.send('POST', path, body, this.maxRetries);
  }

  put(path: string, body: unknown): Promise<unknown> {
    return this.send('PUT', path, body, this.maxRetries);
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    maxRetries: number,
  ): Promise<unknown> {
    const token = await this.options.token();
    if (!token) throw new PrintfulNotConnectedError();

    const response = await sendWithRetries(
      () =>
        this.options.fetch(`${PRINTFUL_API}${path}`, {
          method,
          headers: headers(token, body !== undefined),
          signal: withTimeout(this.options.signal, 30_000),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      {
        maxRetries,
        sleep: (milliseconds) => this.sleep(milliseconds, this.options.signal),
        waitSeconds: retryDelay,
        maxWaitSeconds: MAX_WAIT_SECONDS,
      },
    );
    return unwrap(response);
  }
}

function headers(token: string, hasBody: boolean): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

/** Seconds to wait from `Retry-After`, or from text such as "try again after 60 seconds". */
async function retryDelay(response: Response): Promise<number> {
  const header = retryAfterSeconds(response, 0);
  if (header > 0) return header;
  // A copy, so the answer can still be read when it is returned instead of retried.
  const text = await response.clone().text();
  const stated = /(\d+)\s*seconds?/i.exec(text)?.[1];
  return stated ? Number(stated) : DEFAULT_RETRY_SECONDS;
}

async function unwrap(response: Response): Promise<unknown> {
  const body = await readJsonResponse(
    response,
    errorMessage,
    (status, message, retryAfter) => new PrintfulApiError(status, message, undefined, retryAfter),
  );
  return objectAt(body, 'response')['result'];
}

/** Printful explains errors in `error.message`, older endpoints in `result`. */
function errorMessage({ error, result }: JsonObject): unknown {
  const message = (error as JsonObject | null | undefined)?.['message'];
  return typeof message === 'string' && message ? message : result;
}
