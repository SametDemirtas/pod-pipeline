import { Flex, TextField } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { ListingPriceDto, ShopOptionsDto } from '@pod/contracts/client';
import { familyLabel } from '../../shared/family-label.js';
import { Field } from '../../shared/Field.js';
import { ShippingProfileSelect } from './ShippingProfileSelect.js';

interface FamilyPriceRowProps {
  readonly familyId: string;
  readonly shop: ShopOptionsDto;
  readonly typed: string;
  /** The price saved before, maybe in another currency. */
  readonly saved: ListingPriceDto | undefined;
  readonly example: string;
  readonly wrong: boolean;
  readonly profile: string | undefined;
  readonly onPrice: (text: string) => void;
  readonly onProfile: (profileId: string | null) => void;
}

/** One product's price and shipping profile. */
export function FamilyPriceRow({
  familyId,
  shop,
  typed,
  saved,
  example,
  wrong,
  profile,
  onPrice,
  onProfile,
}: FamilyPriceRowProps) {
  const { t } = useTranslation();
  const id = `price-${familyId}`;
  const hint = wrong
    ? t('settings.prices.invalid', { example })
    : saved && saved.currency !== shop.currency
      ? t('settings.prices.otherCurrency', { currency: saved.currency })
      : undefined;
  return (
    <Flex gap="4" wrap="wrap" align="start">
      <Field
        id={id}
        label={t('settings.prices.price', {
          product: familyLabel(t, familyId),
          currency: shop.currency,
        })}
        hint={hint}
        invalid={wrong}
      >
        {(describedBy) => (
          <TextField.Root
            id={id}
            inputMode="decimal"
            placeholder={example}
            style={{ maxWidth: 160 }}
            value={typed}
            aria-describedby={describedBy}
            aria-invalid={wrong}
            onChange={(event) => {
              onPrice(event.target.value);
            }}
          />
        )}
      </Field>
      <ShippingProfileSelect familyId={familyId} shop={shop} value={profile} onChange={onProfile} />
    </Flex>
  );
}
