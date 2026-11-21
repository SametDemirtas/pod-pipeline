import { Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListingPriceDto, ShopOptionsDto } from '@pod/contracts/client';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { useFamilies } from '../../shared/use-families.js';
import { parsePrice, priceExample, typedPrices, wrongPrices } from '../../shared/price.js';
import { isEtsyMissing, useShopOptions } from '../../shared/use-shop-options.js';
import { useSettings, useUpdateSettings } from '../../shared/use-settings.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { FamilyPriceRow } from './FamilyPriceRow.js';
import { SavedStatus } from './SavedStatus.js';

type Prices = Readonly<Record<string, ListingPriceDto>>;

/** The price each product's prepared listings get, in the shop's currency. */
export function ListingPricesSetting() {
  const { t } = useTranslation();
  const settings = useSettings();
  const families = useFamilies();
  const shop = useShopOptions(true);
  const loading = settings.isPending || families.isPending || shop.isPending;

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="4">
        {t('settings.prices.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.prices.help')}
      </Text>
      {isEtsyMissing(shop.error) && (
        <ConnectionNotice code="ETSY_NOT_CONNECTED" message={t('settings.prices.connect')} />
      )}
      {shop.isError && !isEtsyMissing(shop.error) && (
        <ErrorCallout error={shop.error} onRetry={() => void shop.refetch()} />
      )}
      {settings.isError && (
        <ErrorCallout error={settings.error} onRetry={() => void settings.refetch()} />
      )}
      {families.isError && (
        <ErrorCallout error={families.error} onRetry={() => void families.refetch()} />
      )}
      {loading && !shop.isError && !settings.isError && !families.isError && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {shop.data && settings.data && families.data && (
        <PricesForm
          // Keyed, so prices typed in one currency are not taken for another.
          key={shop.data.currency}
          shop={shop.data}
          familyIds={families.data.map((family) => family.id)}
          saved={settings.data.listingPrices}
          savedProfiles={settings.data.shippingProfiles}
        />
      )}
    </Flex>
  );
}

interface PricesFormProps {
  readonly shop: ShopOptionsDto;
  readonly familyIds: readonly string[];
  readonly saved: Prices;
  /** Shipping profile ids chosen before, by family. */
  readonly savedProfiles: Readonly<Record<string, string>>;
}

function PricesForm({ shop, familyIds, saved, savedProfiles }: PricesFormProps) {
  const { t, i18n } = useTranslation();
  const update = useUpdateSettings();
  const digits = shop.currencyDigits;
  const [typed, setTyped] = useState<Readonly<Record<string, string>>>(() =>
    typedPrices(saved, shop, i18n.language),
  );
  // Only prices the seller changed are saved, so one set in another currency stays until replaced.
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [profiles, setProfiles] = useState<Readonly<Record<string, string | null>>>({});
  const priceOf = (familyId: string) => parsePrice(typed[familyId] ?? '', digits);
  const invalid = wrongPrices(familyIds, typed, shop);
  const example = priceExample(digits, i18n.language);

  return (
    <Flex asChild direction="column" gap="2">
      <form
        aria-label={t('settings.prices.title')}
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid.length > 0) return;
          update.mutate(
            {
              listingPrices: Object.fromEntries(
                [...changed].map((familyId) => {
                  const amount = priceOf(familyId);
                  return [familyId, amount === null ? null : { amount, currency: shop.currency }];
                }),
              ),
              shippingProfiles: profiles,
            },
            {
              onSuccess: () => {
                setChanged(new Set());
                setProfiles({});
              },
            },
          );
        }}
      >
        {familyIds.map((familyId) => {
          const profile = familyId in profiles ? profiles[familyId] : savedProfiles[familyId];
          return (
            <FamilyPriceRow
              key={familyId}
              familyId={familyId}
              shop={shop}
              typed={typed[familyId] ?? ''}
              saved={saved[familyId]}
              example={example}
              wrong={invalid.includes(familyId)}
              profile={profile ?? undefined}
              onPrice={(text) => {
                update.reset();
                setTyped((current) => ({ ...current, [familyId]: text }));
                setChanged((current) => new Set(current).add(familyId));
              }}
              onProfile={(chosen) => {
                update.reset();
                setProfiles((current) => ({ ...current, [familyId]: chosen }));
              }}
            />
          );
        })}
        <Flex align="center" gap="3">
          <BusyButton
            type="submit"
            variant="soft"
            busy={update.isPending}
            loading={update.isPending}
          >
            {t('settings.prices.save')}
          </BusyButton>
          <SavedStatus saved={update.isSuccess} />
        </Flex>
        {update.isError && <ErrorCallout error={update.error} />}
      </form>
    </Flex>
  );
}
