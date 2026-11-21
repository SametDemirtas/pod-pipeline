import { Box, Grid, Skeleton } from '@radix-ui/themes';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PrintCheckDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { missingConnection } from '../../shared/missing-connection.js';
import { areaLabel } from '../../shared/print-labels.js';
import { PrintFacts } from './PrintFacts.js';
import { PrintPreview } from './PrintPreview.js';

const COLUMNS = { initial: '1', md: 'minmax(0, 3fr) minmax(240px, 2fr)' } as const;

interface PrintCheckResultProps {
  readonly check: UseQueryResult<PrintCheckDto>;
  readonly storageKey: string;
}

/** The check for the chosen options; an earlier result stays dimmed while the next loads. */
export function PrintCheckResult({ check, storageKey }: PrintCheckResultProps) {
  const { t } = useTranslation();

  if (check.isPending) {
    return (
      <LoadingStatus label={t('print.loading')}>
        <Skeleton height="200px" />
      </LoadingStatus>
    );
  }
  if (check.isError) {
    const missing = missingConnection(check.error);
    return missing ? (
      <ConnectionNotice {...missing} />
    ) : (
      <ErrorCallout error={check.error} onRetry={() => void check.refetch()} />
    );
  }

  const result = check.data;
  const variant = result.variants.find((candidate) => candidate.id === result.variantId);
  const listedArea = variant?.areas.find((candidate) => candidate.placement === result.printArea);
  if (!variant || !listedArea) return null;
  // Artwork printed upright goes on the area turned a quarter.
  const { upright } = result;
  const area = upright
    ? { ...listedArea, width: upright.width, height: upright.height }
    : listedArea;
  const stale = check.isPlaceholderData;

  return (
    <Box aria-busy={stale} style={{ opacity: stale ? 0.5 : 1, transition: 'opacity 150ms' }}>
      <Grid columns={COLUMNS} gap="6" align="start">
        <PrintPreview
          check={result}
          area={area}
          storageKey={upright?.storageKey ?? storageKey}
          label={t('print.previewLabel', {
            variant: variant.name,
            area: areaLabel(t, area.placement),
          })}
        />
        <PrintFacts check={result} areaDpi={area.dpi} />
      </Grid>
    </Box>
  );
}
