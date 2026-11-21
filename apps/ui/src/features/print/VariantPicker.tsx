import { type PrintVariantDto } from '@pod/contracts/client';
import { choosesByColor } from '@pod/rules';
import { asOptions, LabeledSelect } from '../../shared/LabeledSelect.js';
import { colorsOf, sizesOf, variantFor } from '../../shared/variant-options.js';

interface VariantPickerProps {
  readonly variants: readonly PrintVariantDto[];
  readonly variant: PrintVariantDto;
  readonly onChange: (variantId: string) => void;
  readonly labels: { readonly variant: string; readonly color: string; readonly size: string };
}

/** One list of variants, or a colour and a size list for products made in many colours. */
export function VariantPicker({ variants, variant, onChange, labels }: VariantPickerProps) {
  if (!choosesByColor(variants)) {
    const options = variants.map((candidate) => ({ value: candidate.id, label: candidate.name }));
    return (
      <LabeledSelect
        minWidth={160}
        label={labels.variant}
        value={variant.id}
        options={options}
        onChange={onChange}
      />
    );
  }

  const pick = (color: string | null, size: string | null) => {
    const next = variantFor(variants, color, size);
    if (next) onChange(next.id);
  };

  return (
    <>
      <LabeledSelect
        minWidth={160}
        label={labels.color}
        value={variant.color ?? ''}
        options={asOptions(colorsOf(variants))}
        onChange={(color) => {
          pick(color, variant.size);
        }}
      />
      <LabeledSelect
        minWidth={160}
        label={labels.size}
        value={variant.size ?? ''}
        options={asOptions(sizesOf(variants, variant.color))}
        onChange={(size) => {
          pick(variant.color, size);
        }}
      />
    </>
  );
}
