import type { Clock } from '@pod/core';
import { FakeFetch, type FakeReply } from './fake-fetch.js';

/** What a test session of a service that rotates refresh tokens is made from. */
export interface TestSessionParts<C> {
  readonly credentials: () => Promise<C>;
  readonly saveRefreshToken: (previous: string, next: string) => Promise<void>;
  readonly fetch: typeof fetch;
  readonly clock: Clock;
}

/** What a test client of the service is made from: the session, and no real waits. */
export interface TestClientParts<S> {
  readonly session: S;
  readonly fetch: typeof fetch;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

export interface SignedInClientOptions<C, S, T> {
  readonly credentials: C;
  /** The token endpoint's answer, which the first request waits for. */
  readonly tokenReply: FakeReply;
  /** Part of the token endpoint's address, to leave its requests out of `calls`. */
  readonly tokenPath: string;
  readonly now: Date;
  readonly session: (parts: TestSessionParts<C>) => S;
  readonly client: (parts: TestClientParts<S>) => T;
}

/** A client of a signed-in service whose first request also refreshes the access token. */
export function signedInClient<C extends { readonly refreshToken: string }, S, T>(
  options: SignedInClientOptions<C, S, T>,
  replies: readonly FakeReply[],
) {
  const fake = new FakeFetch().reply(options.tokenReply, ...replies);
  let stored = options.credentials;
  const session = options.session({
    credentials: () => Promise.resolve(stored),
    saveRefreshToken: (_previous, refreshToken) => {
      stored = { ...stored, refreshToken };
      return Promise.resolve();
    },
    fetch: fake.fetch,
    clock: { now: () => options.now },
  });
  const client = options.client({ session, fetch: fake.fetch, sleep: () => Promise.resolve() });
  /** Requests after the token refresh. */
  const calls = () => fake.requests.filter((request) => !request.url.includes(options.tokenPath));
  return { fake, client, calls };
}
