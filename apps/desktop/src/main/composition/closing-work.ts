import type { ClosingWork } from '../shared/wait-at-most.js';

/** How long closing waits for work under way before the database closes anyway. */
const CLOSE_TIMEOUT_MS = 10_000;
/** Etsy may take two minutes to answer a new draft; cutting that off can leave the draft behind. */
const LISTING_CLOSE_TIMEOUT_MS = 150_000;

/** What is lost when each part is cut off, and how long closing waits for it; in closing order. */
const CLOSE_RISKS = {
  batch: {
    risk: 'a listing being prepared may be left unfinished, and text being written paid for again',
    withinMs: LISTING_CLOSE_TIMEOUT_MS,
  },
  scheduler: { risk: 'a pin being sent may show as not sent' },
  pins: { risk: 'a pin change may not be saved' },
  catalog: { risk: 'an import may be incomplete' },
  print: { risk: 'mockups Printful made may not be stored' },
  listings: {
    risk: 'a listing draft may be left on Etsy, or a listing change not saved',
    withinMs: LISTING_CLOSE_TIMEOUT_MS,
  },
  research: { risk: 'a research run may not be stored' },
  scenes: { risk: 'a billed scene may not be stored' },
  upscale: { risk: 'a larger copy of an artwork may be left unfinished' },
  rotation: { risk: 'a turned copy of an artwork may be left unfinished' },
  connections: { risk: 'a new connection may not be saved' },
} as const satisfies Readonly<Record<string, { risk: string; withinMs?: number }>>;

export type ClosingParts = Readonly<
  Record<keyof typeof CLOSE_RISKS, { readonly close: () => Promise<void> }>
>;

/**
 * Waits up to the limits for work under way to be saved, so nothing done on
 * Etsy, Printful, Pinterest or an image service is lost; what is still running
 * then is logged.
 */
export function closingWork(parts: ClosingParts): ClosingWork[] {
  return (Object.keys(CLOSE_RISKS) as (keyof typeof CLOSE_RISKS)[]).map((name) => {
    const limits: { risk: string; withinMs?: number } = CLOSE_RISKS[name];
    return {
      close: () => parts[name].close(),
      risk: limits.risk,
      withinMs: limits.withinMs ?? CLOSE_TIMEOUT_MS,
    };
  });
}
