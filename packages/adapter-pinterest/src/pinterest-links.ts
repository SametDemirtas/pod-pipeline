import type { PinLinks } from '@pod/core';

/** Where Pinterest shows a published pin. */
export const PINTEREST_LINKS: PinLinks = {
  pinUrl: (pinId) => `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`,
};
