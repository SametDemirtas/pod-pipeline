import type {
  BatchListingTextDto,
  MockupDto,
  PrintVariantDto,
  ShopOptionsDto,
} from '@pod/contracts/client';
import {
  firstCharacters,
  isPublishablePhoto,
  LISTING_LIMITS,
  listingVariantIds,
  shippingChoice,
} from '@pod/rules';
import { formatTags } from '../../shared/tags.js';
import { savedPrices, type SavedPrices } from './draft-prices.js';
import { mainLanguage, textKeyOf, type ListingDraft } from './listing-draft.js';

interface DraftSources {
  readonly title: string;
  readonly revision: number;
  readonly variants: readonly PrintVariantDto[];
  /** The variant the print check shows; its colour is offered first. */
  readonly variantId: string;
  /** The print area checked; only variants that print there are offered. */
  readonly printArea: string;
  readonly mockups: readonly MockupDto[];
  readonly shop: ShopOptionsDto;
  /** The shipping profile chosen for the product in the settings; the shop's first when none. */
  readonly shippingProfileId: string | undefined;
  /** The sizes the settings list for the product; every size when none. */
  readonly sizes: readonly string[] | undefined;
  /** Text a batch job wrote for the design; none when it wrote none. */
  readonly prepared?: BatchListingTextDto | null | undefined;
  /** The product's prices from the settings; the price fields start empty without them. */
  readonly prices?: SavedPrices | undefined;
}

/**
 * A sensible start: the text a batch job wrote, the prices the settings give
 * the product, the variants {@link listingVariantIds} picks, the newest photos
 * of this revision, and the first of each shop setting.
 */
export function initialDraft(sources: DraftSources): ListingDraft {
  const { variants, shop } = sources;
  const check = { variants, variantId: sources.variantId, printArea: sources.printArea };
  const variantIds = listingVariantIds(check, sources.sizes);
  const picked = new Set(variantIds);
  const sizes = variants.filter((variant) => picked.has(variant.id)).map((variant) => variant.size);
  return {
    title: firstCharacters(sources.title, LISTING_LIMITS.title),
    description: '',
    tags: '',
    ...savedPrices(sources.prices, shop, sizes),
    variantIds,
    mockupIds: sources.mockups
      .filter((mockup) => mockup.designRevision === sources.revision && isPublishablePhoto(mockup))
      .slice(0, LISTING_LIMITS.photos)
      .map((mockup) => mockup.id),
    // None when the one chosen left the shop, so the seller picks again.
    shippingProfileId: shippingChoice(shop, sources.shippingProfileId).profile?.id ?? '',
    readinessStateId: shop.readinessStates[0]?.id ?? '',
    returnPolicyId: shop.returnPolicies[0]?.id ?? '',
    productionPartnerIds: shop.productionPartners.map((partner) => partner.id),
    languages: [],
    translations: [],
    translatedFrom: '',
    ...preparedWords(sources.prepared, shop),
  };
}

/**
 * The words a batch job wrote, with its translations marked as made from them;
 * nothing when it wrote them in another language than the shop's main one now.
 */
function preparedWords(
  prepared: BatchListingTextDto | null | undefined,
  shop: Pick<ShopOptionsDto, 'languages'>,
): Partial<ListingDraft> {
  if (!prepared || prepared.language !== mainLanguage(shop)) return {};
  const others = shop.languages.slice(1);
  const words = {
    title: prepared.title,
    description: prepared.description,
    tags: formatTags(prepared.tags),
  };
  const translations = prepared.translations
    .filter((translation) => others.includes(translation.language))
    .map((translation) => ({
      ...translation,
      tags: [...translation.tags],
      // The batch keeps no check of these words; the form checks them itself.
      humanizer: null,
    }));
  return {
    ...words,
    languages: translations.map((translation) => translation.language),
    translations,
    translatedFrom: textKeyOf(words),
  };
}
