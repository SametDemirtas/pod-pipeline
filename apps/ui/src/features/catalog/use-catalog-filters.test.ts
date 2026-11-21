import { expect, it } from 'vitest';
import { catalogReturnPath } from './use-catalog-filters.js';

it.each([
  [{ catalogSearch: '?family=mug' }, '/?family=mug'],
  [{ catalogSearch: '' }, '/'],
  [{ catalogSearch: 3 }, '/'],
  [{ other: 'x' }, '/'],
  [null, '/'],
  [undefined, '/'],
])('goes back from state %j to %j', (state, path) => {
  expect(catalogReturnPath(state)).toBe(path);
});
