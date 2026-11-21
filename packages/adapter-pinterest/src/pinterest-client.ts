import { readJsonResponse, sendSignedIn, sleep, type AccessTokens } from '@pod/adapter-http';
import { PinterestApiError, PinterestSignInError } from './errors.js';

/** What the client signs requests with; {@link PinterestSession} for a stored sign-in. */
type PinterestAuth = AccessTokens;

const PINTEREST_API = 'https://api.pinterest.com/v5';

export interface PinterestClientOptions {
  readonly session: PinterestAuth;
  readonly fetch: typeof fetch;
  /** Waits out a rate limit; given the client's signal, so a cancel does not sit out the wait. */
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Stops every request, e.g. when the seller cancels; each also has its own timeout. */
  readonly signal?: AbortSignal;
  /** How often a rate-limited request is tried again before giving up. */
  readonly maxRetries?: number;
}

/** Calls the Pinterest API v5 as the signed-in seller, with JSON in and out. */
export class PinterestClient {
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: PinterestClientOptions) {
    this.sleep = options.sleep ?? sleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  get(path: string): Promise<unknown> {
    return this.send('GET', path);
  }

  /** Makes sure an access token is at hand, refreshing the sign-in when needed. */
  async signIn(): Promise<void> {
    await this.token();
  }

  post(path: string, json: unknown): Promise<unknown> {
    return this.send('POST', path, json);
  }

  /** A token refresh that failed is told apart from the request, which was never sent. */
  private async token(): Promise<string> {
    try {
      return await this.options.session.accessToken();
    } catch (error) {
      throw new PinterestSignInError(error);
    }
  }

  private async send(method: string, path: string, json?: unknown): Promise<unknown> {
    const response = await sendSignedIn(
      `${PINTEREST_API}${path}`,
      async () => ({
        method,
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: 'application/json',
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      }),
      // Pins carry their image, which takes longer than other requests.
      json === undefined ? 30_000 : 90_000,
      { ...this.options, sleep: this.sleep, maxRetries: this.maxRetries },
    );
    // Pinterest's errors read `{ code, message }`.
    return readJsonResponse(
      response,
      (body) => body['message'],
      (status, message, retryAfter) =>
        new PinterestApiError(status, message, undefined, retryAfter),
    );
  }
}
