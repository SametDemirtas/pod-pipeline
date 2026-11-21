/** The marketplace's badges on search result cards, by the code the app keeps in every market. */
const MARKET_BADGES = ['bestseller', 'marketPick', 'popularNow'] as const;
export type MarketBadge = (typeof MARKET_BADGES)[number];

const BADGES: ReadonlySet<string> = new Set(MARKET_BADGES);

export function isMarketBadge(value: string): value is MarketBadge {
  return BADGES.has(value);
}
