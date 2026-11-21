import type { TFunction } from 'i18next';
import {
  RESEARCH_MARKETS,
  UNCHECKED_RESEARCH_MARKETS,
  type ResearchMarket,
} from '@pod/contracts/client';
import type { SelectOption } from './LabeledSelect.js';

/** Where research searches until the seller picks another market. */
export const DEFAULT_MARKET: ResearchMarket = 'US';

/** The market's name in the interface language, e.g. "United States". */
export function marketLabel(t: TFunction, market: ResearchMarket): string {
  return t(`research.markets.${market}`);
}

/** The market's name for choosing it, marked as beta while its page words are unchecked. */
function marketChoiceLabel(t: TFunction, market: ResearchMarket): string {
  const name = marketLabel(t, market);
  return UNCHECKED_RESEARCH_MARKETS.includes(market)
    ? t('research.marketBeta', { market: name })
    : name;
}

/** Every market research can search, to choose from. */
export function marketOptions(t: TFunction): SelectOption<ResearchMarket>[] {
  return RESEARCH_MARKETS.map((value) => ({ value, label: marketChoiceLabel(t, value) }));
}
