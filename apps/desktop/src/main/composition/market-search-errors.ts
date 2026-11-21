import {
  MarketLayoutChangedError,
  ResearchClosedError,
  ResearchTimeoutError,
} from '@pod/adapter-etsy';
import type { MarketSearch } from '@pod/core';
import {
  ProviderFailedError,
  ProviderUnavailableError,
} from '../application/errors/provider-errors.js';
import {
  ResearchBlockedError,
  ResearchCancelledError,
  ResearchPageChangedError,
} from '../application/errors/research-errors.js';
import { toAppError } from './provider-errors.js';

/**
 * A page Chromium could not load, e.g. `ERR_NAME_NOT_RESOLVED` with errno -105.
 * `ERR_ABORTED` only says the page moved on to another address.
 */
function isPageUnreachable(error: unknown): boolean {
  const { code, errno } = (error ?? {}) as { code?: unknown; errno?: unknown };
  return (
    typeof code === 'string' &&
    code.startsWith('ERR_') &&
    code !== 'ERR_ABORTED' &&
    typeof errno === 'number' &&
    errno < 0
  );
}

/** A search the seller let time out at Etsy's check reads as blocked; other waits as failed. */
export function translateMarketSearch(search: MarketSearch): MarketSearch {
  return {
    search: async (query, market) => {
      try {
        return await search.search(query, market);
      } catch (error) {
        if (error instanceof ResearchClosedError) throw new ResearchCancelledError();
        if (error instanceof MarketLayoutChangedError) throw new ResearchPageChangedError();
        if (error instanceof ResearchTimeoutError) {
          throw error.blocked
            ? new ResearchBlockedError()
            : new ProviderFailedError('Etsy', error.message);
        }
        if (isPageUnreachable(error)) throw new ProviderUnavailableError('Etsy');
        // A search only reads Etsy, so one that broke off changed nothing and can run again.
        throw toAppError(error, 'Etsy', { readOnly: true });
      }
    },
  };
}
