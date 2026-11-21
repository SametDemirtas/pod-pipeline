import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { Flex, Text, TextField } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { MAX_SEARCH_CHARACTERS, type ProductFamilyDto } from '@pod/contracts/client';
import { familyLabel } from '../../shared/family-label.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { ALL_FAMILIES } from './use-catalog-filters.js';

interface CatalogFiltersProps {
  readonly families: readonly ProductFamilyDto[];
  readonly familyId: string;
  readonly search: string;
  readonly onFamilyChange: (familyId: string) => void;
  readonly onSearchChange: (search: string) => void;
}

export function CatalogFilters(props: CatalogFiltersProps) {
  const { t } = useTranslation();

  return (
    <Flex gap="4" wrap="wrap" align="end">
      <Flex direction="column" gap="1" flexGrow="1" style={{ minWidth: 240, maxWidth: 420 }}>
        <Text as="label" size="2" weight="medium" htmlFor="design-search">
          {t('catalog.searchLabel')}
        </Text>
        <TextField.Root
          id="design-search"
          type="search"
          value={props.search}
          placeholder={t('catalog.searchPlaceholder')}
          maxLength={MAX_SEARCH_CHARACTERS}
          onChange={(event) => {
            props.onSearchChange(event.target.value);
          }}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
      </Flex>
      <LabeledSelect
        label={t('catalog.familyLabel')}
        value={props.familyId}
        onChange={props.onFamilyChange}
        options={[
          { value: ALL_FAMILIES, label: t('families.all') },
          ...props.families.map((family) => ({
            value: family.id,
            label: familyLabel(t, family.id),
          })),
        ]}
      />
    </Flex>
  );
}
