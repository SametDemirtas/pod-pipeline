import { describe, expect, it } from 'vitest';
import {
  MarketLayoutChangedError,
  ResearchClosedError,
  ResearchTimeoutError,
} from '@pod/adapter-etsy';
import { MARKETS } from '@pod/core';
import { ProviderUnavailableError } from '../application/errors/provider-errors.js';
import { translateMarketSearch } from './market-search-errors.js';

describe('translateMarketSearch', () => {
  it('translate Etsy research failures', async () => {
    const failing = (error: Error) =>
      translateMarketSearch({ search: () => Promise.reject(error) }).search('q', MARKETS.US);

    await expect(failing(new ResearchClosedError())).rejects.toMatchObject({
      code: 'RESEARCH_CANCELLED',
    });
    await expect(failing(new ResearchTimeoutError(true))).rejects.toMatchObject({
      code: 'RESEARCH_BLOCKED',
    });
    await expect(failing(new MarketLayoutChangedError())).rejects.toMatchObject({
      code: 'RESEARCH_PAGE_CHANGED',
    });
    await expect(failing(new ResearchTimeoutError(false))).rejects.toMatchObject({
      code: 'PROVIDER_FAILED',
      details: { service: 'Etsy' },
    });
    await expect(failing(new TypeError('fetch failed'))).rejects.toMatchObject({
      code: 'PROVIDER_FAILED',
    });
    const loadFailure = (code: string, errno: number) =>
      Object.assign(new Error(`${code} (${errno}) loading 'https://www.etsy.com'`), {
        code,
        errno,
      });
    for (const [code, errno] of [
      ['ERR_NAME_NOT_RESOLVED', -105],
      ['ERR_INTERNET_DISCONNECTED', -106],
      ['ERR_CONNECTION_REFUSED', -102],
    ] as const) {
      await expect(failing(loadFailure(code, errno))).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    }
    const aborted = loadFailure('ERR_ABORTED', -3);
    await expect(failing(aborted)).rejects.toBe(aborted);
    const nodeError = Object.assign(new Error('bad argument'), { code: 'ERR_INVALID_ARG_TYPE' });
    await expect(failing(nodeError)).rejects.toBe(nodeError);
    const markets: string[] = [];
    await expect(
      translateMarketSearch({
        search: (query, market) => {
          markets.push(market.region);
          return Promise.resolve({
            query,
            resultsLabel: null,
            listings: [],
            suggestions: [],
            suggestionsAvailable: true,
            warnings: [],
          });
        },
      }).search('q', MARKETS.DE),
    ).resolves.toMatchObject({ query: 'q' });
    expect(markets).toEqual(['DE']);
  });
});
