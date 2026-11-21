import { type CreateListingRequest, type ShopOptionsDto } from '@pod/contracts';
import {
  importedRevisionOf,
  isPriceGap,
  listedPrices,
  listedSizes,
  providerPhotos,
  type ListedPrices,
  type ListedPrint,
} from '@pod/rules';
import type { PreparedText } from '@pod/core';
import {
  BatchDesignChangedError,
  ListingPriceMissingError,
  ShopSetupMissingError,
} from '../../errors/batch-errors.js';
import { ShopCurrencyChangedError } from '../../errors/listing-errors.js';
import { listedPrint } from '../../listing/listed-print.js';
import {
  DONE,
  SKIPPED,
  type BatchCatalog,
  type BatchStepsDeps,
  type StepRunner,
} from '../step-runner.js';
import { whenFree } from '../busy-waits.js';
import { shippingProfileFor } from './shipping-profile.js';

type DraftStepDeps = Pick<BatchStepsDeps, 'settings' | 'wait' | 'rules'> & {
  readonly catalog: Pick<
    BatchCatalog,
    'getDesign' | 'getListing' | 'checkPrint' | 'listMockups' | 'createListing'
  >;
};

/**
 * Creates the unpublished Etsy draft from the prepared text, the family's
 * price and shipping profile from the settings, the shop's first processing
 * time and return policy, and Printful's photos. Publishing stays with the seller.
 */
export function draftStep({ catalog, settings, wait, rules }: DraftStepDeps): StepRunner {
  return async (item, run, signal) => {
    if (await catalog.getListing({ id: item.designId })) return SKIPPED;
    const prepared = item.text;
    if (!prepared) throw new Error(`No listing text was prepared for ${item.designKey}`);
    const [design, chosen, shop] = await Promise.all([
      catalog.getDesign({ id: item.designId }),
      settings.get(),
      run.shop(),
    ]);
    // The text must describe the artwork; making it larger or turning it since changes neither.
    if (importedRevisionOf(design) > item.designRevision) {
      throw new BatchDesignChangedError(item.designKey);
    }
    const [listed, mockups] = await Promise.all([
      listedPrint(catalog, settings, design),
      catalog.listMockups({ id: item.designId }),
    ]);
    const prices = listedPrices(chosen, design.familyId, shop.currency, listedSizes(listed));
    if (isPriceGap(prices)) {
      throw prices.kind === 'currency'
        ? new ShopCurrencyChangedError(shop.currency)
        : new ListingPriceMissingError(prices.familyId, prices.sizes);
    }
    const shippingProfile = shippingProfileFor(shop, chosen.shippingProfiles, design.familyId);
    const [readinessState] = shop.readinessStates;
    if (!shippingProfile || !readinessState) throw new ShopSetupMissingError();
    const photos = providerPhotos(mockups, design.revision).slice(0, rules.photos);
    const request = draftRequest(item.designId, prepared, {
      listed,
      prices,
      shop,
      shippingProfileId: shippingProfile.id,
      readinessStateId: readinessState.id,
      mockupIds: photos.map((photo) => photo.id),
    });
    // A listing made in the window while the window held the service is left as it is.
    const created = await whenFree(
      async () => {
        if (await catalog.getListing({ id: item.designId })) return false;
        await catalog.createListing(request);
        return true;
      },
      wait,
      signal,
    );
    return created ? DONE : SKIPPED;
  };
}

interface DraftChoices {
  readonly listed: ListedPrint;
  readonly prices: ListedPrices;
  readonly shop: ShopOptionsDto;
  readonly shippingProfileId: string;
  readonly readinessStateId: string;
  readonly mockupIds: readonly string[];
}

/** The draft as the window's listing form sends it. */
function draftRequest(
  designId: string,
  prepared: PreparedText,
  { listed, prices, shop, shippingProfileId, readinessStateId, mockupIds }: DraftChoices,
): CreateListingRequest {
  const [returnPolicy] = shop.returnPolicies;
  const { text } = prepared;
  return {
    designId,
    printArea: listed.check.printArea,
    fit: listed.check.fit,
    language: prepared.language,
    title: text.title,
    description: text.description,
    tags: [...text.tags],
    price: prices.price,
    ...(Object.keys(prices.sizePrices).length > 0 ? { sizePrices: prices.sizePrices } : {}),
    currency: shop.currency,
    variantIds: [...listed.variantIds],
    mockupIds: [...mockupIds],
    shippingProfileId,
    readinessStateId,
    ...(returnPolicy ? { returnPolicyId: returnPolicy.id } : {}),
    productionPartnerIds: shop.productionPartners.map((partner) => partner.id),
    translations: prepared.translations.map((translation) => ({
      language: translation.language,
      ...translation.text,
      tags: [...translation.text.tags],
    })),
  };
}
