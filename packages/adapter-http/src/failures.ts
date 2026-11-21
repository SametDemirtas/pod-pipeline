/**
 * How an adapter's error should reach the seller; each adapter classifies its
 * own. `unreachable` means the request never got there; `interrupted` means
 * the service may have acted on the request anyway; `busy` means it turned the
 * request away for now, over a rate limit or overload, and a later try may work.
 */
export type ServiceFailure =
  | { readonly kind: 'not-connected' | 'unreachable'; readonly service: string }
  | { readonly kind: 'failed' | 'interrupted'; readonly service: string; readonly reason: string }
  | {
      readonly kind: 'busy';
      readonly service: string;
      /** How long the service asked to wait, when it said. */
      readonly retryAfterSeconds?: number | undefined;
    };

/** The services an adapter speaks for, as the seller knows them, and how it reads their errors. */
export interface ServiceFailures<S extends string = string> {
  readonly services: readonly S[];
  /** How an error should reach the seller; `undefined` for errors of other adapters. */
  readonly classify: (error: unknown) => ServiceFailure | undefined;
}

/** Keeps the services' names as literal types, so a list of adapters can name them. */
export function serviceFailures<const S extends string>(
  services: readonly S[],
  classify: (error: unknown) => ServiceFailure | undefined,
): ServiceFailures<S> {
  return { services, classify };
}

/** A request that never reached the service, or one that may have and broke off. */
export type NetworkFailure =
  { readonly kind: 'unreachable' } | { readonly kind: 'interrupted'; readonly reason: string };

/** Connection failures before anything was sent; others may have reached the service. */
const NEVER_SENT = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Socket errors that end a connection, as Node and its fetch (undici) report them. */
const CONNECTION_ERRORS = new Set([
  ...NEVER_SENT,
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_ABORTED',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
]);

const codeOf = (value: unknown): string | undefined => {
  const code: unknown =
    typeof value === 'object' && value !== null ? (value as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
};

/** Why a request got no answer, or `undefined` when the error is not about the network. */
export function classifyNetworkError(error: unknown): NetworkFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.name === 'TimeoutError') return { kind: 'interrupted', reason: 'timed out' };
  if (error.name === 'AbortError') return { kind: 'interrupted', reason: 'cancelled' };
  const code = codeOf(error.cause) ?? codeOf(error);
  // Node's fetch reports connection failures as `fetch failed`, and a body cut off while
  // being read as `terminated`, each with the socket error as cause.
  const fetchFailure =
    error instanceof TypeError &&
    (error.message === 'fetch failed' || error.message === 'terminated');
  if (!fetchFailure && !(code !== undefined && CONNECTION_ERRORS.has(code))) return undefined;
  return code !== undefined && NEVER_SENT.has(code)
    ? { kind: 'unreachable' }
    : { kind: 'interrupted', reason: 'connection lost' };
}

/** Server errors after which the service may have carried out the request anyway. */
const UNCERTAIN_STATUSES: ReadonlySet<number> = new Set([500, 502, 504]);

/**
 * Whether a request that changes something may have taken effect although
 * it failed: the answer was a server error of `apiError`, or the connection
 * broke after the request was sent.
 */
export function mayHaveActed(
  error: unknown,
  apiError: abstract new (...args: never[]) => Error & { readonly status?: number | undefined },
): boolean {
  if (error instanceof apiError) {
    return error.status !== undefined && UNCERTAIN_STATUSES.has(error.status);
  }
  return classifyNetworkError(error)?.kind === 'interrupted';
}

/**
 * The failure of a request that only reads: one that broke off changed
 * nothing, so it reads as failed and can simply be sent again.
 */
export function readOnlyFailure(failure: ServiceFailure): ServiceFailure {
  return failure.kind === 'interrupted' ? { ...failure, kind: 'failed' } : failure;
}

/**
 * A failed sign-in classified by its cause: a network failure reads as `service`
 * unreachable or, as signing in changes nothing the seller sees, failed;
 * anything else as `classify` reads it.
 */
export function classifySignInError(
  cause: unknown,
  service: string,
  classify: (error: unknown) => ServiceFailure | undefined,
): ServiceFailure | undefined {
  const network = classifyNetworkError(cause);
  if (!network) return classify(cause);
  return network.kind === 'interrupted'
    ? { kind: 'failed', service, reason: network.reason }
    : { kind: 'unreachable', service };
}
