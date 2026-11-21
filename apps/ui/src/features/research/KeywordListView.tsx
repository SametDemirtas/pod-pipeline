import { TrashIcon } from '@radix-ui/react-icons';
import { Badge, Callout, Flex, Heading, Skeleton, Table, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  MAX_LIST_KEYWORDS,
  type KeywordEntryDto,
  type KeywordFigureDto,
} from '@pod/contracts/client';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { formatDate } from '../../shared/format.js';
import { LoadMoreFooter } from '../../shared/LoadMoreFooter.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { marketLabel } from '../../shared/market-label.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { useKeywordList, useRemoveKeywordList } from './use-research.js';

/** Rows shown at first and added per "Load more", so a list of thousands renders quickly. */
const ROWS_PER_PAGE = 200;

/** An imported keyword list with the figures its keyword tool exported, as the file has them. */
export function KeywordListView({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const selected = useKeywordList(id);
  const remove = useRemoveKeywordList();
  const [shown, setShown] = useState(ROWS_PER_PAGE);

  if (selected.isPending) {
    return (
      <LoadingStatus>
        <Skeleton height="200px" />
      </LoadingStatus>
    );
  }
  if (selected.isError) {
    return <ErrorCallout error={selected.error} onRetry={() => void selected.refetch()} />;
  }
  const { fileName, market, importedAt, figures, keywords, truncated } = selected.data;

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Heading as="h2" size="5">
          {t('research.listFrom', { file: fileName })}
        </Heading>
        <RemoveListButton
          fileName={fileName}
          pending={remove.isPending}
          onConfirm={() => {
            remove.mutate(id, {
              onSuccess: () => {
                void navigate('/research');
              },
            });
          }}
        />
      </Flex>
      <Text size="2" color="gray">
        {t('research.listHelp', {
          date: formatDate(importedAt, i18n.language),
          market: marketLabel(t, market),
        })}
      </Text>
      {truncated && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>{t('research.listTruncated', { limit: MAX_LIST_KEYWORDS })}</Callout.Text>
        </Callout.Root>
      )}
      {remove.error && <ErrorCallout error={remove.error} />}
      <KeywordTable figures={figures} keywords={keywords.slice(0, shown)} />
      <LoadMoreFooter
        shown={Math.min(shown, keywords.length)}
        total={keywords.length}
        more={shown < keywords.length}
        onLoadMore={() => {
          setShown((count) => count + ROWS_PER_PAGE);
        }}
      />
    </Flex>
  );
}

interface RemoveListButtonProps {
  readonly fileName: string;
  readonly pending: boolean;
  readonly onConfirm: () => void;
}

function RemoveListButton({ fileName, pending, onConfirm }: RemoveListButtonProps) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      trigger={
        <BusyButton variant="soft" color="red" busy={pending} loading={pending}>
          <TrashIcon />
          {t('research.removeList')}
        </BusyButton>
      }
      title={t('research.removeListTitle')}
      description={t('research.removeListDescription', { file: fileName })}
      confirmLabel={t('research.removeList')}
      color="red"
      onConfirm={onConfirm}
      // The list goes away, and the page with it.
      restoreFocus={false}
    />
  );
}

interface KeywordTableProps {
  readonly figures: readonly KeywordFigureDto[];
  readonly keywords: readonly KeywordEntryDto[];
}

function KeywordTable({ figures, keywords }: KeywordTableProps) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const figure = (keyword: KeywordEntryDto, name: KeywordFigureDto) => {
    const value = keyword[name];
    return value === null ? '–' : number.format(value);
  };
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>{t('research.keyword')}</Table.ColumnHeaderCell>
          {figures.map((name) => (
            <Table.ColumnHeaderCell key={name} justify="end">
              {t(`research.figures.${name}`)}
            </Table.ColumnHeaderCell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {keywords.map((keyword) => (
          <Table.Row key={keyword.term}>
            <Table.RowHeaderCell>
              <Flex gap="2" align="center" wrap="wrap">
                {keyword.term}
                {keyword.trademark && (
                  <Badge color="red" variant="soft">
                    {t('research.trademark')}
                  </Badge>
                )}
              </Flex>
            </Table.RowHeaderCell>
            {figures.map((name) => (
              <Table.Cell key={name} justify="end">
                {figure(keyword, name)}
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
