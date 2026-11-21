import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import {
  Flex,
  Grid,
  Heading,
  Link as ThemeLink,
  Skeleton,
  Text,
  TextField,
} from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { ResearchMarket } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { formatDate } from '../../shared/format.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { PageHeading } from '../../shared/PageHeading.js';
import { DEFAULT_MARKET, marketLabel } from '../../shared/market-label.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { KeywordListsPanel } from './KeywordListsPanel.js';
import { MarketSelect } from './MarketSelect.js';
import { KeywordListView } from './KeywordListView.js';
import { RunReport } from './RunReport.js';
import { useResearchList, useRunResearch } from './use-research.js';

// From the small breakpoint, so the side lists stay beside the report in a narrow window.
const COLUMNS = { initial: '1', sm: 'minmax(0, 3fr) minmax(220px, 1fr)' } as const;

/** Etsy searches run like a signed-out buyer, with what their results say, and imported keyword lists. */
export function ResearchPage() {
  const { t } = useTranslation();
  const { id, listId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<ResearchMarket>(DEFAULT_MARKET);
  const runResearch = useRunResearch();

  return (
    <Flex direction="column" gap="5">
      <Flex direction="column" gap="1">
        <PageHeading>{t('research.heading')}</PageHeading>
        <Text color="gray">{t('research.help')}</Text>
      </Flex>
      <Flex asChild direction="column" gap="2">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (runResearch.isPending || !query.trim()) return;
            runResearch.mutate(
              { query: query.trim(), market },
              {
                onSuccess: (run) => {
                  void navigate(`/research/${run.id}`);
                },
              },
            );
          }}
        >
          <Flex gap="2" wrap="wrap">
            <TextField.Root
              aria-label={t('research.query')}
              placeholder={t('research.queryExample')}
              value={query}
              style={{ flex: '1 1 280px' }}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            >
              <TextField.Slot>
                <MagnifyingGlassIcon />
              </TextField.Slot>
            </TextField.Root>
            <MarketSelect label={t('research.market')} value={market} onChange={setMarket} />
            <BusyButton
              type="submit"
              busy={runResearch.isPending}
              loading={runResearch.isPending}
              disabled={!query.trim()}
            >
              {t('research.search')}
            </BusyButton>
          </Flex>
          <Text size="1" color="gray" role="status">
            {runResearch.isPending ? t('research.searching') : t('research.privacy')}
          </Text>
        </form>
      </Flex>
      {runResearch.error && <ErrorCallout error={runResearch.error} />}
      <Grid columns={COLUMNS} gap="6" align="start">
        <Flex direction="column" gap="5" style={{ minWidth: 0 }}>
          {id === undefined && listId === undefined && <Text size="2">{t('research.pick')}</Text>}
          {id !== undefined && <RunReport id={id} />}
          {listId !== undefined && <KeywordListView key={listId} id={listId} />}
        </Flex>
        <Flex direction="column" gap="5">
          <History selectedId={id} />
          <KeywordListsPanel selectedId={listId} />
        </Flex>
      </Grid>
    </Flex>
  );
}

function History({ selectedId }: { selectedId: string | undefined }) {
  const { t, i18n } = useTranslation();
  const runs = useResearchList();

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="3">
        {t('research.history')}
      </Heading>
      {runs.isPending && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {runs.isError && <ErrorCallout error={runs.error} onRetry={() => void runs.refetch()} />}
      {runs.data?.length === 0 && <Text size="2">{t('research.noHistory')}</Text>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {runs.data?.map((run) => (
          <li key={run.id}>
            <ThemeLink asChild weight={run.id === selectedId ? 'bold' : 'regular'}>
              <Link
                to={`/research/${run.id}`}
                aria-current={run.id === selectedId ? 'page' : undefined}
              >
                {run.query}
              </Link>
            </ThemeLink>
            <Text as="p" size="1" color="gray">
              {t('research.runDetails', {
                market: marketLabel(t, run.market),
                date: formatDate(run.createdAt, i18n.language),
              })}
            </Text>
          </li>
        ))}
      </ul>
    </Flex>
  );
}
