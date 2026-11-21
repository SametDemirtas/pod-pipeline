import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** How long the app waits for the seller to allow access in the browser. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

function page(message: string): string {
  return (
    '<!doctype html><meta charset="utf-8"><title>POD Pipeline</title>' +
    `<p style="font:16px system-ui;margin:3rem">${message}</p>`
  );
}

export interface OAuthRedirectOptions {
  /** Named on the page the browser shows, e.g. `Etsy`. */
  readonly service: string;
  readonly port: number;
  readonly path: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** A sign-in's wait for the redirect. */
export interface OAuthRedirect {
  /** Resolves with the port once requests are accepted. */
  readonly listening: Promise<number>;
  readonly code: Promise<string>;
  readonly close: () => void;
}

/**
 * Waits on the loopback redirect address for a service's answer to a sign-in
 * in the browser. Only a request carrying the state this sign-in made is
 * accepted. A cancelled sign-in fails with the signal's reason.
 */
export function waitForOAuthCode(state: string, options: OAuthRedirectOptions): OAuthRedirect {
  const { service, port, timeoutMs = SIGN_IN_TIMEOUT_MS, signal } = options;
  const servers: Server[] = [];
  const listening = Promise.withResolvers<number>();
  const code = Promise.withResolvers<string>();
  // Callers may await these late, so a failure is never left unhandled.
  listening.promise.catch(() => undefined);
  code.promise.catch(() => undefined);
  let timer: NodeJS.Timeout | undefined = undefined;
  let closed = false;
  const close = () => {
    closed = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    // A server still starting is closed by `listenOnLoopback` once it listens.
    for (const server of servers.filter((started) => started.listening)) {
      server.close();
      server.closeAllConnections();
    }
  };
  const stop = (reason: unknown) => {
    close();
    listening.reject(reason);
    code.reject(reason);
  };
  function onAbort(): void {
    stop(signal?.reason);
  }
  const result = { listening: listening.promise, code: code.promise, close };
  // A sign-in cancelled before it began never hears the abort event.
  if (signal?.aborted) {
    stop(signal.reason);
    return result;
  }
  signal?.addEventListener('abort', onAbort, { once: true });
  timer = setTimeout(() => {
    stop(new Error(`nobody allowed access on ${service} in time`));
  }, timeoutMs);
  const answer = redirectAnswer(state, options, code, close);
  listenOnLoopback(servers, answer, port, () => closed).then(
    listening.resolve,
    (error: unknown) => {
      const { code: reason, port: taken = port } = error as NodeJS.ErrnoException & {
        port?: number;
      };
      stop(
        reason === 'EADDRINUSE'
          ? new Error(`port ${taken} is used by another program; close it and try again`)
          : error,
      );
    },
  );
  return result;
}

/** Answers the browser's redirect: a page saying how the sign-in went, then closes. */
function redirectAnswer(
  state: string,
  { service, path }: Pick<OAuthRedirectOptions, 'service' | 'path'>,
  code: { resolve: (code: string) => void; reject: (reason: unknown) => void },
  close: () => void,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== path || url.searchParams.get('state') !== state) {
      response.writeHead(404).end();
      return;
    }
    const received = url.searchParams.get('code');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    // Close only once the page is sent, so the browser shows it.
    response.end(
      page(
        received
          ? `${service} is connected. You can close this tab.`
          : `${service} did not allow access. Return to the app.`,
      ),
      close,
    );
    if (received) code.resolve(received);
    else code.reject(new Error(url.searchParams.get('error') ?? 'access was not allowed'));
  };
}

/** Codes of a system without IPv6, where listening on IPv4 alone is enough. */
const NO_IPV6 = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

/**
 * Listens on the IPv4 and the IPv6 loopback address at one port, as the
 * browser may resolve `localhost` to either. A system without IPv6 is fine; a
 * port another program holds on either address is not, as the browser could
 * reach that program instead. Resolves with the port. A server that starts
 * listening after the sign-in was closed is closed again.
 */
async function listenOnLoopback(
  servers: Server[],
  answer: (request: IncomingMessage, response: ServerResponse) => void,
  port: number,
  closed: () => boolean,
): Promise<number> {
  const ipv4 = createServer(answer);
  servers.push(ipv4);
  const chosen = await listen(ipv4, port, '127.0.0.1');
  if (closed()) throw stopped(ipv4);
  const ipv6 = createServer(answer);
  servers.push(ipv6);
  try {
    await listen(ipv6, chosen, '::1');
  } catch (error) {
    if (!NO_IPV6.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
  if (closed()) throw stopped(ipv4, ipv6);
  return chosen;
}

function stopped(...servers: Server[]): Error {
  for (const server of servers) server.close();
  return new Error('the sign-in was closed');
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });
}

/** What signing in to a service in the browser needs. */
export interface BrowserSignInDeps {
  readonly fetch: typeof fetch;
  /** Stops the sign-in, e.g. when the seller cancels. */
  readonly signal?: AbortSignal;
  /** The redirect port; only tests change it. */
  readonly port?: number;
}

/**
 * Opens the service's consent page in the browser and resolves with the code
 * the service redirects back with. `authorizeUrl` builds the page for the
 * state the redirect has to carry.
 */
export async function authorizeInBrowser(
  options: OAuthRedirectOptions,
  authorizeUrl: (state: string) => string,
  openExternal: (url: string) => Promise<void>,
): Promise<string> {
  const state = randomBytes(16).toString('base64url');
  const redirect = waitForOAuthCode(state, options);
  try {
    await redirect.listening;
    await openExternal(authorizeUrl(state));
    return await redirect.code;
  } finally {
    redirect.close();
  }
}
