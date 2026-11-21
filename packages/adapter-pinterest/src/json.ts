import { jsonReaders } from '@pod/adapter-http';
import { UnexpectedPinterestResponseError } from './errors.js';

export const { objectAt, arrayAt, stringAt, idAt } = jsonReaders(
  (what) => new UnexpectedPinterestResponseError(what),
);
