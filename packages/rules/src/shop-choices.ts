import type { ShopOptionDto, ShopOptionsDto } from '@pod/contracts/client';

/** The shipping profile a product's listings use, and whether the one chosen left the shop. */
export interface ShippingChoice {
  /** `undefined` when the one chosen left the shop, or the shop has none. */
  readonly profile: ShopOptionDto | undefined;
  readonly gone: boolean;
}

/** The profile chosen for a product in the settings, else the shop's first. */
export function shippingChoice(
  shop: Pick<ShopOptionsDto, 'shippingProfiles'>,
  chosenId: string | undefined,
): ShippingChoice {
  if (chosenId === undefined) return { profile: shop.shippingProfiles[0], gone: false };
  const profile = shop.shippingProfiles.find((candidate) => candidate.id === chosenId);
  return { profile, gone: profile === undefined };
}
