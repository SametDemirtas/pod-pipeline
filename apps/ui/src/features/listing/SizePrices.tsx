import { Flex, Text, TextField } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isWrongPrice, type ShopCurrency } from '../../shared/price.js';

interface SizePricesProps {
  readonly sizes: readonly string[];
  readonly prices: Readonly<Record<string, string>>;
  readonly shop: ShopCurrency;
  readonly onChange: (prices: Record<string, string>) => void;
}

/** Optional prices for single sizes, e.g. more for 2XL; empty fields use the main price. */
export function SizePrices({ sizes, prices, shop, onChange }: SizePricesProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const hintId = useId();
  const fieldId = useId();

  return (
    <Flex direction="column" gap="2" role="group" aria-labelledby={labelId}>
      <Text id={labelId} size="2" weight="medium">
        {t('listing.sizePrices', { currency: shop.currency })}
      </Text>
      <Text id={hintId} size="1" color="gray">
        {t('listing.sizePricesHint')}
      </Text>
      <Flex gap="3" wrap="wrap">
        {sizes.map((size, index) => (
          <Flex key={size} direction="column" gap="1" style={{ width: 96 }}>
            <Text as="label" size="1" htmlFor={`${fieldId}-${String(index)}`}>
              {size}
            </Text>
            <TextField.Root
              id={`${fieldId}-${String(index)}`}
              inputMode="decimal"
              size="1"
              aria-describedby={hintId}
              aria-invalid={isWrongPrice(prices[size] ?? '', shop)}
              value={prices[size] ?? ''}
              onChange={(event) => {
                onChange({ ...prices, [size]: event.target.value });
              }}
            />
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}
