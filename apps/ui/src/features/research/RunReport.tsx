import { Badge, Callout, Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { UNCHECKED_RESEARCH_MARKETS } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { marketLabel } from '../../shared/market-label.js';
import { ListingsTable } from './ListingsTable.js';
import { ResearchSummary } from './ResearchSummary.js';
import { TermsTable } from './TermsTable.js';
import { useResearchRun } from './use-research.js';

/** What one earlier search showed: the summary, Etsy's suggestions, the terms and the listings. */
export function RunReport({ id }: { id: string }) {
  const { t } = useTranslation();
  const selected = useResearchRun(id);
  const suggestionsId = useId();

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
  const { query, market, report } = selected.data;

  return (
    <>
      <Heading as="h2" size="5">
        {t('research.reportFor', { query, market: marketLabel(t, market) })}
      </Heading>
      {UNCHECKED_RESEARCH_MARKETS.includes(market) && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>{t('research.betaNote')}</Callout.Text>
        </Callout.Root>
      )}
      {report.warnings.map((warning) => (
        <Callout.Root key={warning} color="amber" size="1" role="status">
          <Callout.Text>{t(`research.warnings.${warning}`)}</Callout.Text>
        </Callout.Root>
      ))}
      <ResearchSummary report={report} />
      <Flex direction="column" gap="2">
        <Heading as="h3" size="2" id={suggestionsId}>
          {t('research.suggestions')}
        </Heading>
        {!report.suggestionsAvailable && (
          <Text size="2" color="gray">
            {t('research.suggestionsUnavailable')}
          </Text>
        )}
        {report.suggestions.length > 0 && (
          <Flex gap="2" wrap="wrap" aria-labelledby={suggestionsId} role="list">
            {report.suggestions.map((suggestion) => (
              <Badge key={suggestion} role="listitem" variant="outline">
                {suggestion}
              </Badge>
            ))}
          </Flex>
        )}
      </Flex>
      <TermsTable report={report} />
      <ListingsTable listings={report.listings} />
    </>
  );
}
