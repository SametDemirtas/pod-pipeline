import { Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { familyLabel } from '../../shared/family-label.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { useFamilies } from '../../shared/use-families.js';
import { useShopOptions } from '../../shared/use-shop-options.js';
import { useSettings } from '../../shared/use-settings.js';
import { SizesForm } from './SizesForm.js';
import { useFamilySizes } from './use-family-sizes.js';

/** Which sizes a product's prepared listings sell, and what each costs when it differs. */
export function ListingSizesSetting() {
  const { t } = useTranslation();
  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];
  const settings = useSettings();
  const shop = useShopOptions(true);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  // A product the settings already list sizes for comes first, as its sizes are the ones to check.
  const sized = settings.data?.listingSizes ?? {};
  const familyId =
    chosen ?? families.find((family) => Object.hasOwn(sized, family.id))?.id ?? families[0]?.id;
  const sizes = useFamilySizes(familyId);

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="4">
        {t('settings.sizes.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.sizes.help')}
      </Text>
      <LabeledSelect
        label={t('settings.sizes.product')}
        value={familyId}
        minWidth={240}
        options={families.map(({ id }) => ({ value: id, label: familyLabel(t, id) }))}
        onChange={setChosen}
      />
      {(familiesQuery.isPending || (familyId !== undefined && sizes.isPending)) && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {familiesQuery.isError && (
        <ErrorCallout error={familiesQuery.error} onRetry={() => void familiesQuery.refetch()} />
      )}
      {settings.isError && (
        <ErrorCallout error={settings.error} onRetry={() => void settings.refetch()} />
      )}
      {sizes.isError && <ErrorCallout error={sizes.error} onRetry={() => void sizes.refetch()} />}
      {sizes.data && sizes.data.length <= 1 && (
        <Text size="2" color="gray">
          {t('settings.sizes.oneSize')}
        </Text>
      )}
      {/* Without the shop's currency no form shows; the prices setting above asks for Etsy. */}
      {familyId && shop.data && settings.data && sizes.data && sizes.data.length > 1 && (
        // Keyed, so another product or currency starts from what was saved for it.
        <SizesForm
          key={`${familyId}:${shop.data.currency}`}
          familyId={familyId}
          sizes={sizes.data}
          shop={shop.data}
          settings={settings.data}
        />
      )}
    </Flex>
  );
}
