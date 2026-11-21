import { Checkbox, Flex, Text, TextField } from '@radix-ui/themes';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListingPriceDto, SettingsDto, ShopOptionsDto } from '@pod/contracts/client';
import { toggled } from '../../shared/collections.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { parsePrice, priceExample, typedPrices, wrongPrices } from '../../shared/price.js';
import { useUpdateSettings } from '../../shared/use-settings.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { SavedStatus } from './SavedStatus.js';

interface SizesFormProps {
  readonly familyId: string;
  /** Every size the product comes in, in the print provider's order. */
  readonly sizes: readonly string[];
  readonly shop: ShopOptionsDto;
  readonly settings: SettingsDto;
}

/** The sizes a product's listings sell, each with an optional price of its own. */
export function SizesForm({ familyId, sizes, shop, settings }: SizesFormProps) {
  const { t, i18n } = useTranslation();
  const update = useUpdateSettings();
  const digits = shop.currencyDigits;
  const hintId = useId();
  const [listed, setListed] = useState<ReadonlySet<string>>(
    () => new Set(settings.listingSizes[familyId] ?? sizes),
  );
  const [typed, setTyped] = useState<Readonly<Record<string, string>>>(() =>
    typedPrices(settings.sizePrices[familyId] ?? {}, shop, i18n.language),
  );
  const priceOf = (size: string) => parsePrice(typed[size] ?? '', digits);
  const invalid = wrongPrices(sizes, typed, shop);
  const example = priceExample(digits, i18n.language);
  const sizePrices = Object.fromEntries(
    sizes.flatMap((size): [string, ListingPriceDto][] => {
      const amount = priceOf(size);
      return amount === null ? [] : [[size, { amount, currency: shop.currency }]];
    }),
  );

  return (
    <Flex asChild direction="column" gap="2">
      <form
        aria-label={t('settings.sizes.title')}
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid.length > 0 || listed.size === 0) return;
          update.mutate({
            listingSizes: { [familyId]: sizes.filter((size) => listed.has(size)) },
            sizePrices: { [familyId]: Object.keys(sizePrices).length > 0 ? sizePrices : null },
          });
        }}
      >
        {sizes.map((size) => (
          <SizeRow
            key={size}
            size={size}
            currency={shop.currency}
            listed={listed.has(size)}
            typed={typed[size] ?? ''}
            wrong={invalid.includes(size)}
            hintId={hintId}
            onListed={(checked) => {
              update.reset();
              setListed((current) => toggled(current, size, checked));
            }}
            onPrice={(text) => {
              update.reset();
              setTyped((current) => ({ ...current, [size]: text }));
            }}
          />
        ))}
        <Text id={hintId} size="1" color={invalid.length > 0 || listed.size === 0 ? 'red' : 'gray'}>
          {listed.size === 0
            ? t('settings.sizes.chooseOne')
            : invalid.length > 0
              ? t('settings.prices.invalid', { example })
              : t('settings.sizes.priceHint')}
        </Text>
        <Flex align="center" gap="3">
          <BusyButton
            type="submit"
            variant="soft"
            busy={update.isPending}
            loading={update.isPending}
          >
            {t('settings.sizes.save')}
          </BusyButton>
          <SavedStatus saved={update.isSuccess} />
        </Flex>
        {update.isError && <ErrorCallout error={update.error} />}
      </form>
    </Flex>
  );
}

interface SizeRowProps {
  readonly size: string;
  readonly currency: string;
  readonly listed: boolean;
  readonly typed: string;
  readonly wrong: boolean;
  readonly hintId: string;
  readonly onListed: (listed: boolean) => void;
  readonly onPrice: (text: string) => void;
}

function SizeRow({ size, currency, listed, typed, wrong, hintId, ...on }: SizeRowProps) {
  const { t } = useTranslation();
  return (
    <Flex gap="3" align="center" wrap="wrap">
      <Text as="label" size="2" style={{ minWidth: 120 }}>
        <Flex gap="2" align="center">
          <Checkbox
            checked={listed}
            onCheckedChange={(checked) => {
              on.onListed(checked === true);
            }}
          />
          {size}
        </Flex>
      </Text>
      <TextField.Root
        aria-label={t('settings.sizes.price', { size, currency })}
        inputMode="decimal"
        placeholder={t('settings.sizes.familyPrice')}
        style={{ maxWidth: 200 }}
        value={typed}
        aria-invalid={wrong}
        aria-describedby={hintId}
        onChange={(event) => {
          on.onPrice(event.target.value);
        }}
      />
    </Flex>
  );
}
