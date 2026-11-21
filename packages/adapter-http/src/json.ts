import { parseJson } from '@pod/core';
import { retryAfterSeconds } from './retries.js';

export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * The JSON body of an answer. An error status throws `failed`, with the
 * service's own explanation that `explanation` finds in the body, or the
 * status text, and the seconds a `Retry-After` header asks to wait.
 */
export async function readJsonResponse(
  response: Response,
  explanation: (body: JsonObject) => unknown,
  failed: (status: number, message: string, retryAfter?: number) => Error,
): Promise<unknown> {
  const body = parseJson(await response.text());
  if (response.ok) return body;
  const stated =
    typeof body === 'object' && body !== null ? explanation(body as JsonObject) : undefined;
  const message = typeof stated === 'string' && stated ? stated : undefined;
  const wait = retryAfterSeconds(response, 0);
  throw failed(
    response.status,
    message ?? (response.statusText || 'request failed'),
    wait > 0 ? wait : undefined,
  );
}

export interface JsonReaders {
  readonly objectAt: (value: unknown, what: string) => JsonObject;
  readonly arrayAt: (value: unknown, what: string) => readonly unknown[];
  readonly stringAt: (value: unknown, what: string) => string;
  readonly numberAt: (value: unknown, what: string) => number;
  /** Ids are kept as text; a number too large to be exact is refused. */
  readonly idAt: (value: unknown, what: string) => string;
}

/**
 * Readers that check a response has the shape a service documents, throwing
 * the service's own error with what was wrong.
 */
export function jsonReaders(unexpected: (what: string) => Error): JsonReaders {
  return {
    objectAt: (value, what) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw unexpected(`${what} is not an object`);
      }
      return value as JsonObject;
    },
    arrayAt: (value, what) => {
      if (!Array.isArray(value)) throw unexpected(`${what} is not a list`);
      return value as readonly unknown[];
    },
    stringAt: (value, what) => {
      if (typeof value !== 'string') throw unexpected(`${what} is not text`);
      return value;
    },
    numberAt: (value, what) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw unexpected(`${what} is not a number`);
      }
      return value;
    },
    idAt: (value, what) => {
      if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
      if (typeof value === 'string' && /^\d+$/.test(value)) return value;
      throw unexpected(`${what} is not an id`);
    },
  };
}
