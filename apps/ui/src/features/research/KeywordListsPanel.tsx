import { UploadIcon } from '@radix-ui/react-icons';
import { Flex, Heading, Link as ThemeLink, Skeleton, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_KEYWORD_FILE_BYTES, type ResearchMarket } from '@pod/contracts/client';
import { Link, useNavigate } from 'react-router';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { formatBytes, formatDate } from '../../shared/format.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { DEFAULT_MARKET, marketLabel } from '../../shared/market-label.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { MarketSelect } from './MarketSelect.js';
import { useImportKeywordList, useKeywordLists } from './use-research.js';

/** The keyword lists the seller imported, and the button to import another. */
export function KeywordListsPanel({ selectedId }: { selectedId: string | undefined }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lists = useKeywordLists();
  const importList = useImportKeywordList();
  const [market, setMarket] = useState<ResearchMarket>(DEFAULT_MARKET);

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="3">
        {t('research.lists')}
      </Heading>
      <Text size="1" color="gray">
        {t('research.importHelp', { size: formatBytes(MAX_KEYWORD_FILE_BYTES, i18n.language) })}
      </Text>
      <Flex gap="2" wrap="wrap">
        <MarketSelect label={t('research.listMarket')} value={market} onChange={setMarket} />
        <BusyButton
          variant="soft"
          busy={importList.isPending}
          loading={importList.isPending}
          onClick={() => {
            importList.mutate(market, {
              onSuccess: (list) => {
                if (list !== null) void navigate(`/research/lists/${list.id}`);
              },
            });
          }}
        >
          <UploadIcon />
          {t('research.importList')}
        </BusyButton>
      </Flex>
      {importList.error && <ErrorCallout error={importList.error} />}
      {lists.isPending && (
        <LoadingStatus>
          <Skeleton height="48px" />
        </LoadingStatus>
      )}
      {lists.isError && <ErrorCallout error={lists.error} onRetry={() => void lists.refetch()} />}
      {lists.data?.length === 0 && <Text size="2">{t('research.noLists')}</Text>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {lists.data?.map((list) => (
          <li key={list.id}>
            <ThemeLink asChild weight={list.id === selectedId ? 'bold' : 'regular'}>
              <Link
                to={`/research/lists/${list.id}`}
                aria-current={list.id === selectedId ? 'page' : undefined}
              >
                {list.fileName}
              </Link>
            </ThemeLink>
            <Text as="p" size="1" color="gray">
              {t('research.listSummary', {
                count: list.keywordCount,
                market: marketLabel(t, list.market),
                date: formatDate(list.importedAt, i18n.language),
              })}
            </Text>
          </li>
        ))}
      </ul>
    </Flex>
  );
}
