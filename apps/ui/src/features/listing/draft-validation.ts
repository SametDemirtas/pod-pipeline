import type { PrintVariantDto } from '@pod/contracts/client';
import { LISTING_LIMITS, typedCharacterCount, variationOptions } from '@pod/rules';
import { isListingPrice, isWrongPrice, parsePrice, type ShopCurrency } from '../../shared/price.js';
import { parseTags } from '../../shared/tags.js';
import { DRAFT_FIELDS, type DraftField, type ListingDraft } from './listing-draft.js';

/** What the draft is checked against besides Etsy's fixed limits. */
export interface DraftLimits {
  /** Lower than Etsy's while a note about AI scenes must fit after the text. */
  readonly description: number;
  /** The variants the draft may choose from, to count the options of each variation. */
  readonly variants: readonly PrintVariantDto[];
}

/** Fields that are missing or break one of Etsy's limits, in form order. */
export function draftProblems(
  draft: ListingDraft,
  shop: ShopCurrency,
  limits: DraftLimits,
): DraftField[] {
  const chosen = new Set(draft.variantIds);
  const options = variationOptions(limits.variants.filter((variant) => chosen.has(variant.id)));
  const price = parsePrice(draft.price, shop.currencyDigits);
  const tags = parseTags(draft.tags);
  const broken: Record<DraftField, boolean> = {
    title:
      typedCharacterCount(draft.title) === 0 ||
      typedCharacterCount(draft.title) > LISTING_LIMITS.title,
    description:
      typedCharacterCount(draft.description) === 0 ||
      typedCharacterCount(draft.description) > limits.description,
    tags:
      tags.length > LISTING_LIMITS.tags ||
      tags.some((tag) => typedCharacterCount(tag) > LISTING_LIMITS.tagLength),
    price: !isListingPrice(price, shop),
    sizePrices: Object.values(draft.sizePrices).some((text) => isWrongPrice(text, shop)),
    variants:
      draft.variantIds.length === 0 ||
      draft.variantIds.length > LISTING_LIMITS.variants ||
      options > LISTING_LIMITS.variationOptions,
    photos: draft.mockupIds.length === 0,
    shippingProfile: !draft.shippingProfileId,
    readinessState: !draft.readinessStateId,
  };
  return DRAFT_FIELDS.filter((field) => broken[field]);
}
