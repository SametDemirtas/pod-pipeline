import type { Operation } from '../api/operations.js';

/** The operation of that name; fails the test when there is none. */
export function byName(operations: readonly Operation[], name: Operation['name']): Operation {
  const operation = operations.find((candidate) => candidate.name === name);
  if (!operation) throw new Error(`No operation ${name}`);
  return operation;
}
