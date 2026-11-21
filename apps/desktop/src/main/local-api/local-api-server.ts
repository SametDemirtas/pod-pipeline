import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { invoke } from '../api/invoke.js';
import type { Operation } from '../api/operations.js';
import type { ErrorLogger } from '../api/to-api-error.js';

/**
 * Room for a listing with the longest description Etsy takes in each of its
 * languages, even in scripts of three bytes per character.
 */
export const MAX_BODY_BYTES = 1024 * 1024;
const ROUTE = /^\/api\/([A-Za-z]+)$/;

export interface LocalApiOptions {
  readonly operations: readonly Operation[];
  /** Secret every request must send as `Authorization: Bearer <token>`. */
  readonly token: string;
  readonly log: ErrorLogger;
}

export interface LocalApi {
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * HTTP access to the operations for local tools such as the MCP server.
 * Listens on loopback only, requires the token, and refuses browser requests
 * (any `Origin` header or a foreign `Host`) so web pages cannot reach it.
 */
export async function startLocalApi(options: LocalApiOptions): Promise<LocalApi> {
  const byName = new Map<string, Operation>(
    options.operations.map((operation) => [operation.name, operation]),
  );
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      options.log(error);
      if (!response.headersSent) send(response, 500, { error: 'internal' });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const port = (server.address() as AddressInfo).port;
    const refusal = refuse(request, port, options.token);
    if (refusal) {
      send(response, refusal.status, { error: refusal.error });
      return;
    }
    const operation = byName.get(ROUTE.exec(request.url ?? '')?.[1] ?? '');
    if (!operation) {
      send(response, 404, { error: 'unknown operation' });
      return;
    }

    const body = await readBody(request);
    if (body === null) {
      send(response, 413, { error: 'request too large' });
      return;
    }
    let input: unknown;
    try {
      input = body ? JSON.parse(body) : undefined;
    } catch {
      send(response, 400, { error: 'invalid JSON' });
      return;
    }
    send(response, 200, await invoke(operation, input, options.log));
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}

function refuse(
  request: IncomingMessage,
  port: number,
  token: string,
): { status: number; error: string } | null {
  if (request.headers.origin !== undefined || request.headers.host !== `127.0.0.1:${port}`) {
    return { status: 403, error: 'forbidden' };
  }
  if (!hasToken(request, token)) return { status: 401, error: 'unauthorized' };
  if (request.method !== 'POST') return { status: 405, error: 'method not allowed' };
  return null;
}

function hasToken(request: IncomingMessage, token: string): boolean {
  const given = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The request body, or `null` when it exceeds {@link MAX_BODY_BYTES}. */
async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
