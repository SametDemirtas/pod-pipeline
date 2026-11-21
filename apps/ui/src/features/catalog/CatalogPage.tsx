import { Button, Flex } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../shared/EmptyState.js';
import { PageHeading } from '../../shared/PageHeading.js';
import { useFamilies } from '../../shared/use-families.js';
import { BatchProgressButton } from '../batch/BatchProgressButton.js';
import { ImportDialog } from '../import/ImportDialog.js';
import { CatalogFilters } from './CatalogFilters.js';
import { CatalogResults } from './CatalogResults.js';
import { useCatalogFilters } from './use-catalog-filters.js';
import { useDesignList } from './use-design-list.js';

/**
 * The catalog. Until the first import there is nothing to search, so the page
 * offers one import button in place of the filters and the header button.
 * The header button waits until it is known which of the two layouts applies,
 * so no button moves away under the pointer.
 */
export function CatalogPage() {
  const { t } = useTranslation();
  const families = useFamilies();
  const filters = useCatalogFilters(families.data ?? []);
  const everything = useDesignList({});
  const [importing, setImporting] = useState(false);
  const [showingProgress, setShowingProgress] = useState(false);
  const empty = everything.data?.pages[0]?.total === 0;
  const importButton = (
    <Button
      size="3"
      onClick={() => {
        setImporting(true);
      }}
    >
      {t('catalog.importButton')}
    </Button>
  );

  return (
    <Flex direction="column" gap="5">
      <Flex justify="between" align="center" gap="4" wrap="wrap">
        <PageHeading>{t('catalog.title')}</PageHeading>
        <Flex gap="3" align="center" wrap="wrap">
          <BatchProgressButton open={showingProgress} onOpenChange={setShowingProgress} />
          {!empty && !everything.isPending && importButton}
        </Flex>
      </Flex>
      {empty ? (
        <EmptyState
          title={t('catalog.emptyTitle')}
          body={t('catalog.emptyBody')}
          action={importButton}
        />
      ) : (
        <>
          <CatalogFilters
            families={families.data ?? []}
            familyId={filters.familyId}
            search={filters.search}
            onFamilyChange={filters.setFamilyId}
            onSearchChange={filters.setSearch}
          />
          <CatalogResults
            filter={filters.filter}
            clearFilters={filters.clear}
            onBatchStarted={() => {
              setShowingProgress(true);
            }}
          />
        </>
      )}
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </Flex>
  );
}
