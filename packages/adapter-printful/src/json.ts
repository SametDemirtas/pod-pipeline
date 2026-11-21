import { jsonReaders, type JsonObject } from '@pod/adapter-http';
import { UnexpectedPrintfulResponseError } from './errors.js';

export type { JsonObject };

export const { objectAt, arrayAt, stringAt, numberAt } = jsonReaders(
  (what) => new UnexpectedPrintfulResponseError(what),
);
