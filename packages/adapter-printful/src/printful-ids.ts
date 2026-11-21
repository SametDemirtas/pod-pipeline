import { PrintfulRequestError } from './errors.js';

/** Printful ids are whole numbers; anything else would be sent as `null` and refused vaguely. */
export function printfulId(id: string, what: string): number {
  const number = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(number)) {
    throw new PrintfulRequestError(`"${id}" is not a Printful ${what} id`);
  }
  return number;
}
