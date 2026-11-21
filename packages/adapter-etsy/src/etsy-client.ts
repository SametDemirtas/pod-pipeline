import { readJsonResponse, sendSignedIn, sleep, type AccessTokens } from '@pod/adapter-http';
import { EtsyApiError, EtsySignInError } from './errors.js';
import type { EtsyCredentials } from './etsy-session.js';

/** What the client signs requests with; {@link EtsySession} for a stored sign-in. */
export interface EtsyAuth extends AccessTokens {
  credentials(): Promise<Pick<EtsyCredentials, 'keystring' | 'sharedSecret' | 'shopId'>>;
}

export const ETSY_API = 'https://openapi.etsy.com/v3/application';

export type EtsyBody =
  | { readonly form: Readonly<Record<string, string>> }
  | { readonly json: unknown }
  | { readonly multipart: FormData };

export interface EtsyClientOptions {
  readonly session: EtsyAuth;
  readonly fetch: typeof fetch;
  /** Waits out a rate limit; given the client's signal, so a cancel does not sit out the wait. */
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Stops every request, e.g. when the seller cancels; each also has its own timeout. */
  readonly signal?: AbortSignal;
  /** How often a rate-limited request is tried again before giving up. */
  readonly maxRetries?: number;
}

/** The requests made of the Etsy Open API v3 as the signed-in seller. */
export interface EtsyHttp {
  get(path: string): Promise<unknown>;
  /** `timeoutMs` replaces the usual timeout, for requests Etsy may take long to answer. */
  post(path: string, body: EtsyBody, timeoutMs?: number): Promise<unknown>;
  put(path: string, body: EtsyBody): Promise<unknown>;
  patch(path: string, body: EtsyBody): Promise<unknown>;
  delete(path: string): Promise<unknown>;
  /** The shop the seller signed in with. */
  shopId(): Promise<string>;
}

/** Calls the Etsy Open API v3 as the signed-in seller. */
export class EtsyClient implements EtsyHttp {
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: EtsyClientOptions) {
    this.sleep = options.sleep ?? sleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  get(path: string): Promise<unknown> {
    return this.send('GET', path);
  }

  /** `timeoutMs` replaces the usual timeout, for requests Etsy may take long to answer. */
  post(path: string, body: EtsyBody, timeoutMs?: number): Promise<unknown> {
    return this.send('POST', path, body, timeoutMs);
  }

  put(path: string, body: EtsyBody): Promise<unknown> {
    return this.send('PUT', path, body);
  }

  patch(path: string, body: EtsyBody): Promise<unknown> {
    return this.send('PATCH', path, body);
  }

  delete(path: string): Promise<unknown> {
    return this.send('DELETE', path);
  }

  /** The shop the seller signed in with. */
  async shopId(): Promise<string> {
    return (await this.options.session.credentials()).shopId;
  }

  /** A token refresh that failed is told apart from the request, which was never sent. */
  private async token(): Promise<string> {
    try {
      return await this.options.session.accessToken();
    } catch (error) {
      throw new EtsySignInError(error);
    }
  }

  private async send(
    method: string,
    path: string,
    body?: EtsyBody,
    // Uploads take longer than other requests.
    timeoutMs = body !== undefined && 'multipart' in body ? 60_000 : 30_000,
  ): Promise<unknown> {
    const { session } = this.options;
    const response = await sendSignedIn(
      `${ETSY_API}${path}`,
      async () => {
        const credentials = await session.credentials();
        return {
          method,
          headers: {
            'x-api-key': `${credentials.keystring}:${credentials.sharedSecret}`,
            Authorization: `Bearer ${await this.token()}`,
            Accept: 'application/json',
            ...contentType(body),
          },
          ...(body === undefined ? {} : { body: encode(body) }),
        };
      },
      timeoutMs,
      { ...this.options, sleep: this.sleep, maxRetries: this.maxRetries },
    );
    return readJsonResponse(
      response,
      (answer) => answer['error'],
      (status, message, retryAfter) => new EtsyApiError(status, message, undefined, retryAfter),
    );
  }
}

function contentType(body: EtsyBody | undefined): Record<string, string> {
  if (body === undefined || 'multipart' in body) return {};
  return {
    'Content-Type': 'form' in body ? 'application/x-www-form-urlencoded' : 'application/json',
  };
}

function encode(body: EtsyBody): string | FormData {
  if ('multipart' in body) return body.multipart;
  if ('form' in body) return new URLSearchParams(body.form).toString();
  return JSON.stringify(body.json);
}
