import { useTranslation } from 'react-i18next';
import { type ShopOptionsDto } from '@pod/contracts/client';
import { shippingChoice } from '@pod/rules';
import { familyLabel } from '../../shared/family-label.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';

/** The entry for the shop's first profile, which saves as no choice; no Etsy id has a colon. */
const FIRST = ':first';

interface ShippingProfileSelectProps {
  readonly familyId: string;
  readonly shop: Pick<ShopOptionsDto, 'shippingProfiles'>;
  /** The profile chosen; `undefined` for the shop's first. */
  readonly value: string | undefined;
  /** `null` goes back to the shop's first profile. */
  readonly onChange: (profileId: string | null) => void;
}

/** The Etsy shipping profile a product's prepared listings use. */
export function ShippingProfileSelect({
  familyId,
  shop,
  value,
  onChange,
}: ShippingProfileSelectProps) {
  const { t } = useTranslation();
  const { gone } = shippingChoice(shop, value);

  return (
    <LabeledSelect
      label={t('settings.prices.shipping', { product: familyLabel(t, familyId) })}
      value={gone ? undefined : (value ?? FIRST)}
      minWidth={240}
      options={[
        { value: FIRST, label: t('settings.prices.shippingFirst') },
        ...shop.shippingProfiles.map(({ id, label }) => ({ value: id, label })),
      ]}
      {...(gone ? { hint: t('settings.prices.shippingGone') } : {})}
      onChange={(chosen) => {
        onChange(chosen === FIRST ? null : chosen);
      }}
    />
  );
}
