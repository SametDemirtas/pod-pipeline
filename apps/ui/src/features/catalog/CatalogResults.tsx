import { Button, Card, Flex, Grid, Skeleton, VisuallyHidden } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../shared/EmptyState.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadMoreFooter } from '../../shared/LoadMoreFooter.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { SelectionBar } from './SelectionBar.js';
import { useDesignSelection } from './use-design-selection.js';
import { DesignCard } from './DesignCard.js';
import { useDesignList, type DesignFilter } from './use-design-list.js';

const GRID_COLUMNS = { initial: '2', sm: '3', lg: '4', xl: '5' } as const;

interface CatalogResultsProps {
  readonly filter: DesignFilter;
  /** Offered when the filters match nothing. */
  readonly clearFilters: () => void;
  /** Preparing listings for the picked designs started. */
  readonly onBatchStarted: () => void;
}

/** The design grid with its loading, no-match, error and paging states. */
export function CatalogResults({ filter, clearFilters, onBatchStarted }: CatalogResultsProps) {
  const { t } = useTranslation();
  const list = useDesignList(filter);
  const selection = useDesignSelection(filter);

  if (list.isError) {
    return <ErrorCallout error={list.error} onRetry={() => void list.refetch()} />;
  }
  if (list.isPending) return <CatalogSkeleton />;

  const { pages } = list.data;
  const designs = pages.flatMap((page) => page.items);
  const total = pages.at(-1)?.total ?? 0;
  const shown = designs.map((design) => design.id);
  const updating = list.isPlaceholderData;
  if (designs.length === 0 && !updating) {
    return (
      <EmptyState
        title={t('catalog.noResultsTitle')}
        body={t('catalog.noResultsBody')}
        action={
          <Button variant="soft" onClick={clearFilters}>
            {t('catalog.clearFilters')}
          </Button>
        }
      />
    );
  }

  return (
    <Flex direction="column" gap="4">
      <SelectionBar
        selection={selection}
        shown={shown}
        total={total}
        updating={updating}
        onStarted={onBatchStarted}
      />
      {/* Kept mounted, so screen readers hear the text when it changes. */}
      <VisuallyHidden role="status">{updating ? t('catalog.updating') : ''}</VisuallyHidden>
      <Grid columns={GRID_COLUMNS} gap="4" asChild>
        <ul
          aria-label={t('catalog.title')}
          aria-busy={updating}
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            opacity: updating ? 0.6 : 1,
            transition: 'opacity 150ms',
          }}
        >
          {designs.map((design) => (
            <li key={design.id}>
              <DesignCard
                design={design}
                selected={selection.isPicked(design.id)}
                onSelectedChange={(on) => {
                  selection.toggle(design.id, on);
                }}
              />
            </li>
          ))}
        </ul>
      </Grid>
      <LoadMoreFooter
        shown={designs.length}
        total={total}
        more={list.hasNextPage}
        loading={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
      />
    </Flex>
  );
}

function CatalogSkeleton() {
  const { t } = useTranslation();
  return (
    <LoadingStatus label={t('catalog.loading')}>
      <Grid columns={GRID_COLUMNS} gap="4">
        {Array.from({ length: 8 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </Grid>
    </LoadingStatus>
  );
}

/** Placeholder shaped like a design card, so loaded cards do not shift the grid. */
function CardSkeleton() {
  return (
    <Card>
      <Flex direction="column" gap="3">
        <Skeleton style={{ aspectRatio: '2', width: '100%' }} />
        <Skeleton height="16px" width="40%" />
        <Skeleton height="14px" width="70%" />
      </Flex>
    </Card>
  );
}
