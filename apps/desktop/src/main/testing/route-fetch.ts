import { vi } from 'vitest';

interface Call {
  readonly method: string;
  readonly url: string;
}

/** Answers by URL prefix and records every call. */
export function prefixFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
    calls.push({ method, url });
    const route = Object.keys(routes).find((prefix) => `${method} ${url}`.startsWith(prefix));
    return Promise.resolve(
      route ? (routes[route] as () => Response)() : new Response('', { status: 404 }),
    );
  });
  return { fetch, calls };
}

export const fixedClock = { now: () => new Date('2026-10-24T10:00:00.000Z') };
export const oneId = { next: () => 'id-1' };
