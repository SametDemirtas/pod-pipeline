/** A JSON object as the services send it. */
export type Json = Record<string, unknown>;

/** What an endpoint answers with, given the request and the path's `:name` parts in order. */
export type Answer = (
  request: Request,
  params: readonly string[],
  url: URL,
) => Response | Promise<Response>;

/** One endpoint below a service's base address. */
export interface Route {
  readonly method: string;
  readonly path: RegExp;
  readonly answer: Answer;
}

/** A service the fake stands in for. */
export interface FakeService {
  /** The address every path of the service starts with, without a trailing slash. */
  readonly base: string;
  readonly routes: readonly Route[];
  /** Refuses requests without a bearer token, as the real API does. */
  readonly signedIn?: boolean;
  /** The service's own answer to a path it does not have. */
  readonly missing?: () => Response;
}

/** `pattern` is a path such as `/listings/:id`; each `:name` matches one path segment. */
export function route(method: string, pattern: string, answer: Answer): Route {
  const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:\w+/g, '([^/]+)');
  return { method, path: new RegExp(`^${source}$`), answer };
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function notFound(): Response {
  return json({ error: 'Not found' }, 404);
}

/** The fields of a URL-encoded body. */
export async function formOf(request: Request): Promise<URLSearchParams> {
  return new URLSearchParams(await request.text());
}

export async function jsonOf(request: Request): Promise<Record<string, unknown>> {
  return (await request.json()) as Record<string, unknown>;
}

/** Hands out increasing numeric ids from `first`. */
export function counter(first: number): () => number {
  let next = first;
  return () => next++;
}

/** An 8×8 white PNG, served as every mockup photo. */
export const PHOTO_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR42mP4jwMwDC0JALoev0GJ6La7AAAAAElFTkSuQmCC',
    'base64',
  ),
);

export function bytes(body: Uint8Array, contentType: string): Response {
  return new Response(Uint8Array.from(body), { headers: { 'content-type': contentType } });
}
