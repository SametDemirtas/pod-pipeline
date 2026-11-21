import { Badge, DataList, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { type PrintCheckDto } from '@pod/contracts/client';
import { PRODUCT_FACTS } from '@pod/rules';
import { formatShare } from '../../shared/format.js';

const QUALITY_COLORS = { good: 'jade', acceptable: 'amber', poor: 'red' } as const;

interface PrintFactsProps {
  readonly check: PrintCheckDto;
  /** The resolution the provider prints the checked area at. */
  readonly areaDpi: number;
}

export function PrintFacts({ check, areaDpi }: PrintFactsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  return (
    <DataList.Root>
      <DataList.Item>
        <DataList.Label minWidth="140px">{t('print.resolution')}</DataList.Label>
        <DataList.Value>
          <Flex direction="column" gap="1">
            <span>
              {t('print.dpi', { dpi: check.effectiveDpi })}{' '}
              <Badge color={QUALITY_COLORS[check.quality]} variant="soft" ml="2">
                {t(`print.quality.${check.quality}`)}
              </Badge>
            </span>
            <Text size="1" color="gray">
              {t('print.dpiHint', { dpi: areaDpi })}
            </Text>
          </Flex>
        </DataList.Value>
      </DataList.Item>
      <DataList.Item>
        <DataList.Label minWidth="140px">{t('print.covered')}</DataList.Label>
        <DataList.Value>{formatShare(check.areaCovered, locale)}</DataList.Value>
      </DataList.Item>
      <DataList.Item>
        <DataList.Label minWidth="140px">{t('print.cropped')}</DataList.Label>
        <DataList.Value>{formatShare(check.imageCropped, locale)}</DataList.Value>
      </DataList.Item>
      {PRODUCT_FACTS.filter((fact) => check.productFacts[fact].trim() !== '').map((fact) => (
        <DataList.Item key={fact}>
          <DataList.Label minWidth="140px">{t(`common.facts.${fact}`)}</DataList.Label>
          <DataList.Value>{check.productFacts[fact]}</DataList.Value>
        </DataList.Item>
      ))}
    </DataList.Root>
  );
}
