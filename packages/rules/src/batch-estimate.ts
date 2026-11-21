import type {
  BatchEstimateDto,
  BatchShippingDto,
  ResearchMarket,
  ResearchSummaryDto,
  SettingsDto,
  ShopOptionsDto,
} from '@pod/contracts/client';
import { isPriceGap, listedPrices } from './listing-prices.js';
import { shippingChoice } from './shop-choices.js';

/** Research this recent is reused for a batch's keywords. */
const RESEARCH_REUSE_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

/** A saved search for the same words in the market, recent enough to reuse. */
export function recentRun(
  runs: readonly ResearchSummaryDto[],
  query: string,
  market: ResearchMarket,
  now: Date,
): ResearchSummaryDto | undefined {
  return runs.find(
    (run) =>
      run.query === query &&
      run.market === market &&
      now.getTime() - Date.parse(run.createdAt) < RESEARCH_REUSE_DAYS * DAY_MS,
  );
}

/**
 * The products without a price for the sizes the settings list, all of them
 * standing for one price when none are listed.
 */
export function missingPricesOf(
  settings: Pick<SettingsDto, 'listingSizes' | 'listingPrices' | 'sizePrices'>,
  currency: string,
  familyIds: readonly string[],
): BatchEstimateDto['missingPrices'] {
  return [...new Set(familyIds)].flatMap((familyId) => {
    const sizes = settings.listingSizes[familyId] ?? [null];
    const prices = listedPrices(settings, familyId, currency, sizes);
    if (!isPriceGap(prices)) return [];
    return [
      prices.kind === 'missing'
        ? { familyId: prices.familyId, sizes: prices.sizes }
        : { familyId, sizes: [] },
    ];
  });
}

/** The shipping profile each product's drafts use, in the order the products first come. */
export function shippingOf(
  shop: Pick<ShopOptionsDto, 'shippingProfiles'>,
  chosen: Readonly<Record<string, string>>,
  familyIds: readonly string[],
): BatchShippingDto[] {
  return [...new Set(familyIds)].map((familyId) => {
    const { profile, gone } = shippingChoice(shop, chosen[familyId]);
    const missing = gone ? 'gone' : profile ? null : 'none';
    return { familyId, profile: profile?.label ?? null, missing };
  });
}
