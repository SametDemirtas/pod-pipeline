import type { CreateListingRequest, ShopOptionsDto } from '@pod/contracts/client';
import { parsePrice, type ShopCurrency } from '../../shared/price.js';
import { parseTags } from '../../shared/tags.js';
import type { PrintChoice } from '../print/use-print.js';
import { sizePricesOf } from './draft-prices.js';
import { draftProblems, type DraftLimits } from './draft-validation.js';
import { mainLanguage, textKeyOf, type ListingDraft } from './listing-draft.js';

/** The request, or `null` while something is missing or breaks a limit. */
export function toCreateRequest(
  designId: string,
  choice: PrintChoice,
  draft: ListingDraft,
  shop: ShopCurrency & Pick<ShopOptionsDto, 'languages'>,
  limits: DraftLimits,
): CreateListingRequest | null {
  const price = parsePrice(draft.price, shop.currencyDigits);
  if (price === null || draftProblems(draft, shop, limits).length > 0) return null;
  // Translations of text that has changed since are left out rather than sent stale.
  // Languages the seller unticked after translating are left out too.
  const current =
    draft.translatedFrom === textKeyOf(draft)
      ? draft.translations
          .filter((translation) => draft.languages.includes(translation.language))
          .map(({ language, title, description, tags }) => ({
            language,
            title,
            description,
            tags: [...tags],
          }))
      : [];
  return {
    designId,
    ...(choice.printArea === undefined ? {} : { printArea: choice.printArea }),
    fit: choice.fit,
    language: mainLanguage(shop),
    title: draft.title,
    description: draft.description,
    tags: parseTags(draft.tags),
    price,
    currency: shop.currency,
    ...sizePricesOf(draft.sizePrices, shop.currencyDigits),
    variantIds: [...draft.variantIds],
    mockupIds: [...draft.mockupIds],
    shippingProfileId: draft.shippingProfileId,
    readinessStateId: draft.readinessStateId,
    ...(draft.returnPolicyId ? { returnPolicyId: draft.returnPolicyId } : {}),
    productionPartnerIds: [...draft.productionPartnerIds],
    ...(current.length > 0 ? { translations: current } : {}),
  };
}
