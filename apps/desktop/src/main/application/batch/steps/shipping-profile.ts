import { type ShopOptionDto, type ShopOptionsDto } from '@pod/contracts';
import { shippingChoice } from '@pod/rules';
import { ShippingProfileGoneError } from '../../errors/batch-errors.js';

/**
 * The shipping profile a family's listings use: the one chosen for it in the
 * settings, else the shop's first; `undefined` when the shop has none.
 */
export function shippingProfileFor(
  shop: Pick<ShopOptionsDto, 'shippingProfiles'>,
  chosen: Readonly<Record<string, string>>,
  familyId: string,
): ShopOptionDto | undefined {
  const { profile, gone } = shippingChoice(shop, chosen[familyId]);
  if (gone) throw new ShippingProfileGoneError(familyId);
  return profile;
}
