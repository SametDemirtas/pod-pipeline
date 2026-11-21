import { Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { type PrintVariantDto } from '@pod/contracts/client';
import { choosesByColor, LISTING_LIMITS } from '@pod/rules';
import { toggled } from '../../shared/collections.js';
import { asOptions } from '../../shared/LabeledSelect.js';
import { sizeLabel } from '../../shared/print-labels.js';
import { allSizesOf, colorsOf } from '../../shared/variant-options.js';
import { CheckList } from './CheckList.js';

interface VariantChooserProps {
  readonly familyId: string;
  /** Only variants that can be printed on the chosen print area. */
  readonly variants: readonly PrintVariantDto[];
  readonly chosen: readonly string[];
  readonly onChange: (variantIds: string[]) => void;
}

/** Colors and sizes for clothing, every variant by name for other products. */
export function VariantChooser({ familyId, variants, chosen, onChange }: VariantChooserProps) {
  const { t } = useTranslation();
  const ids = new Set(chosen);
  const picked = variants.filter((variant) => ids.has(variant.id));
  const tooMany = picked.length > LISTING_LIMITS.variants;
  const summary = (
    <Text size="1" color={tooMany ? 'red' : 'gray'} role="status">
      {t('listing.variantCount', { used: picked.length, limit: LISTING_LIMITS.variants })}
    </Text>
  );

  if (!choosesByColor(variants)) {
    return (
      <Flex direction="column" gap="1">
        <CheckList
          label={t('listing.variants')}
          options={variants.map((variant) => ({ value: variant.id, label: variant.name }))}
          checked={ids}
          onToggle={(id, on) => {
            onChange(variants.filter((v) => (v.id === id ? on : ids.has(v.id))).map((v) => v.id));
          }}
        />
        {summary}
      </Flex>
    );
  }

  const colors = new Set(picked.map((variant) => variant.color ?? ''));
  const sizes = new Set(picked.map((variant) => variant.size ?? ''));
  const pick = (nextColors: ReadonlySet<string>, nextSizes: ReadonlySet<string>) => {
    onChange(
      variants
        .filter((v) => nextColors.has(v.color ?? '') && nextSizes.has(v.size ?? ''))
        .map((v) => v.id),
    );
  };
  const allSizes = allSizesOf(variants);

  return (
    <Flex direction="column" gap="2">
      <Flex gap="6" wrap="wrap">
        <CheckList
          label={t('print.color')}
          options={asOptions(colorsOf(variants))}
          checked={colors}
          onToggle={(color, on) => {
            pick(toggled(colors, color, on), sizes.size > 0 ? sizes : new Set(allSizes));
          }}
        />
        <CheckList
          label={sizeLabel(t, familyId)}
          options={asOptions(allSizes)}
          checked={sizes}
          onToggle={(size, on) => {
            // With no colour ticked, a size means that size in every colour.
            pick(colors.size > 0 ? colors : new Set(colorsOf(variants)), toggled(sizes, size, on));
          }}
        />
      </Flex>
      {summary}
    </Flex>
  );
}
