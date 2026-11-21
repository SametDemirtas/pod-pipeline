import { jsonReaders, type JsonObject } from '@pod/adapter-http';
import { UnexpectedEtsyResponseError } from './errors.js';

export type { JsonObject };

export const { objectAt, arrayAt, stringAt, idAt } = jsonReaders(
  (what) => new UnexpectedEtsyResponseError(what),
);

/** The `results` list Etsy wraps collections in. */
export function resultsOf(value: unknown, what: string): readonly JsonObject[] {
  return arrayAt(objectAt(value, what)['results'], `${what} results`).map((item) =>
    objectAt(item, what),
  );
}
