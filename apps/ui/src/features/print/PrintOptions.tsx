import { Flex, SegmentedControl, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { FIT_MODES, type FitModeDto, type PrintVariantDto } from '@pod/contracts/client';
import { areaLabel, sizeLabel } from '../../shared/print-labels.js';
import { VariantPicker } from './VariantPicker.js';

interface PrintOptionsProps {
  readonly familyId: string;
  readonly variants: readonly PrintVariantDto[];
  readonly variant: PrintVariantDto;
  readonly printArea: string;
  readonly fit: FitModeDto;
  readonly onVariantChange: (variantId: string) => void;
  readonly onPrintAreaChange: (printArea: string) => void;
  readonly onFitChange: (fit: FitModeDto) => void;
}

const FIT_LABELS = { contain: 'print.fitContain', cover: 'print.fitCover' } as const;
export function PrintOptions(props: PrintOptionsProps) {
  const { t } = useTranslation();
  const { areas } = props.variant;

  return (
    <Flex gap="4" wrap="wrap" align="end">
      <VariantPicker
        variants={props.variants}
        variant={props.variant}
        onChange={props.onVariantChange}
        labels={{
          variant: t('print.variant'),
          color: t('print.color'),
          size: sizeLabel(t, props.familyId),
        }}
      />
      {areas.length > 1 && (
        <Segments
          label={t('print.area')}
          labelId="print-area-label"
          value={props.printArea}
          options={areas.map((area) => [area.placement, areaLabel(t, area.placement)])}
          onChange={props.onPrintAreaChange}
        />
      )}
      <Segments
        label={t('print.fit')}
        labelId="print-fit-label"
        value={props.fit}
        options={FIT_MODES.map((mode) => [mode, t(FIT_LABELS[mode])])}
        onChange={(value) => {
          const fit = FIT_MODES.find((mode) => mode === value);
          if (fit) props.onFitChange(fit);
        }}
      />
    </Flex>
  );
}

interface SegmentsProps {
  readonly label: string;
  readonly labelId: string;
  readonly value: string;
  readonly options: readonly (readonly [value: string, label: string])[];
  readonly onChange: (value: string) => void;
}

function Segments({ label, labelId, value, options, onChange }: SegmentsProps) {
  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium" id={labelId}>
        {label}
      </Text>
      <SegmentedControl.Root value={value} aria-labelledby={labelId} onValueChange={onChange}>
        {options.map(([optionValue, optionLabel]) => (
          <SegmentedControl.Item key={optionValue} value={optionValue}>
            {optionLabel}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
    </Flex>
  );
}
