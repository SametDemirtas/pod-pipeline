import { json } from './http.js';

/** Printful's envelope around a result. */
export const ok = (result: unknown) => json({ code: 200, result });

/** Printful's error answer, with the status in the body too. */
export const failed = (status: number, message: string) =>
  json({ code: status, result: message, error: { reason: 'Error', message } }, status);
