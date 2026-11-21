import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FakeServices } from '../src/main/testing/fake-services.js';

export interface FakeServiceServer {
  /** The address the app is told to send its service requests to. */
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * Serves the fake services over loopback HTTP the way a test build of the app
 * reaches them: the host of the real service leads the path.
 */
export async function serveFakeServices(services: FakeServices): Promise<FakeServiceServer> {
  const server = createServer((request, response) => {
    answer(services, request, response).catch((error: unknown) => {
      if (response.headersSent) response.destroy(error as Error);
      else response.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

async function answer(
  services: FakeServices,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const method = request.method ?? 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string' && name !== 'host') headers.set(name, value);
  }
  const reply = await services.handle(
    new Request(`https://${(request.url ?? '/').slice(1)}`, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
    }),
  );
  const replyHeaders: Record<string, string> = {};
  reply.headers.forEach((value, name) => {
    replyHeaders[name] = value;
  });
  response.writeHead(reply.status, replyHeaders);
  response.end(Buffer.from(await reply.arrayBuffer()));
}
