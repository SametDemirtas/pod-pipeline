import { Flex, Skeleton, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchEstimateDto, BatchStepDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { familyLabel } from '../../shared/family-label.js';
import { formatList } from '../../shared/format.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import type { useBatchEstimate } from './use-batch.js';

interface BatchEstimateProps {
  readonly steps: readonly BatchStepDto[];
  readonly estimate: ReturnType<typeof useBatchEstimate>;
}

/** Separates groups that hold lists of their own, or names the seller chose, which may hold commas. */
const GROUPS = '; ';

/** What the run would do and cost, counted before the seller confirms. */
export function BatchEstimate({ steps, estimate }: BatchEstimateProps) {
  const { t } = useTranslation();

  if (estimate.isError) {
    return <ErrorCallout error={estimate.error} onRetry={() => void estimate.refetch()} />;
  }
  if (!estimate.data) {
    return (
      <LoadingStatus label={t('batch.estimating')}>
        <Skeleton height="96px" />
      </LoadingStatus>
    );
  }
  return <EstimateLines steps={steps} estimate={estimate.data} />;
}

function EstimateLines({
  steps,
  estimate,
}: {
  steps: readonly BatchStepDto[];
  estimate: BatchEstimateDto;
}) {
  const { t, i18n } = useTranslation();
  const has = (step: BatchStepDto) => steps.includes(step);
  const service = estimate.textService;
  const languages = formatList(estimate.languages, i18n.language);

  return (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {t('batch.estimateTitle')}: {t('batch.estimate.designs', { count: estimate.designs })}
      </Text>
      <Flex asChild direction="column" gap="1">
        <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {has('print') && (
            <Line>{t('batch.estimate.printChecks', { count: estimate.printChecks })}</Line>
          )}
          {has('mockups') && (
            <Line>{t('batch.estimate.mockups', { count: estimate.mockupTasks })}</Line>
          )}
          {has('research') && <Line>{t('batch.estimate.research')}</Line>}
          {has('text') && (
            <Line>
              {t('batch.estimate.text', {
                service,
                model: estimate.textModel,
                min: estimate.textRequests.min,
                max: estimate.textRequests.max,
              })}{' '}
              {t('batch.estimate.languages', { languages })}{' '}
              {t('batch.estimate.noPrices', { service })}
            </Line>
          )}
          {has('draft') && <Line>{t('batch.estimate.drafts', { count: estimate.drafts })}</Line>}
          {estimate.missingPrices.length > 0 && <MissingPricesLine estimate={estimate} />}
          {estimate.shipping.length > 0 && <ShippingLine estimate={estimate} />}
          {has('draft') && estimate.draftsWaiting > 0 && (
            <Line>{t('batch.estimate.draftsWaiting', { count: estimate.draftsWaiting })}</Line>
          )}
        </ul>
      </Flex>
      <Text size="1" color="gray">
        {t('batch.estimate.leftOut')}
      </Text>
    </Flex>
  );
}

function MissingPricesLine({ estimate }: { estimate: BatchEstimateDto }) {
  const { t, i18n } = useTranslation();
  const products = estimate.missingPrices
    .map(({ familyId, sizes }) =>
      sizes.length > 0
        ? `${familyLabel(t, familyId)} (${formatList(sizes, i18n.language)})`
        : familyLabel(t, familyId),
    )
    .join(GROUPS);
  return <Line>{t('batch.estimate.missingPrices', { products })}</Line>;
}

function ShippingLine({ estimate }: { estimate: BatchEstimateDto }) {
  const { t } = useTranslation();
  const profiles = estimate.shipping
    .map(
      ({ familyId, profile, missing }) =>
        `${familyLabel(t, familyId)}: ${
          missing === 'gone'
            ? t('batch.estimate.shippingGone')
            : missing === 'none'
              ? t('batch.estimate.shippingNone')
              : profile
        }`,
    )
    .join(GROUPS);
  return <Line>{t('batch.estimate.shipping', { profiles })}</Line>;
}

function Line({ children }: { children: ReactNode }) {
  return (
    <Text as="p" size="2" asChild>
      <li>{children}</li>
    </Text>
  );
}
