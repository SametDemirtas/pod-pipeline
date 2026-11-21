import { Agent } from 'undici';

/**
 * Node's fetch gives up on an answer whose headers take over five minutes,
 * which an import or a slow Etsy upload can. Without those limits, the
 * timeout of each operation is the only one.
 */
const NO_TRANSPORT_TIMEOUTS = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/** Node's fetch for calls to the app, which may take longer than five minutes to answer. */
export const patientFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    // @types/node describes the dispatcher with its own, older copy of undici's types.
    dispatcher: NO_TRANSPORT_TIMEOUTS as unknown as NonNullable<RequestInit['dispatcher']>,
  });
