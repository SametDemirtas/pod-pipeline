import type { Market, MarketSearchPage } from '../research/market.js';

/** Searches Etsy the way a signed-out buyer in the market does. */
export interface MarketSearch {
  search(query: string, market: Market): Promise<MarketSearchPage>;
}
