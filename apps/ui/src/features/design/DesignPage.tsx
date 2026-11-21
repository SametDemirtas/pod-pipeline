import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { Button, Flex, Skeleton, VisuallyHidden } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { apiErrorCode } from '../../shared/api-error-code.js';
import { EmptyState } from '../../shared/EmptyState.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { PageHeading } from '../../shared/PageHeading.js';
import { catalogReturnPath } from '../catalog/use-catalog-filters.js';
import { DesignDetails } from './DesignDetails.js';
import { useDesign } from './use-design.js';

export function DesignPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const location = useLocation();
  const design = useDesign(id);
  const backLink = (
    <Button variant="ghost" asChild style={{ alignSelf: 'start' }}>
      <Link to={catalogReturnPath(location.state)}>
        <ArrowLeftIcon />
        {t('design.back')}
      </Link>
    </Button>
  );

  if (apiErrorCode(design.error) === 'NOT_FOUND') {
    return (
      <EmptyState
        page
        title={t('design.notFoundTitle')}
        body={t('design.notFoundBody')}
        action={backLink}
      />
    );
  }

  return (
    <Flex direction="column" gap="5">
      {backLink}
      {design.isError && (
        <>
          <PageHeading>{t('design.title')}</PageHeading>
          <ErrorCallout error={design.error} onRetry={() => void design.refetch()} />
        </>
      )}
      {design.isPending && (
        <LoadingStatus label={t('design.loading')}>
          <VisuallyHidden>
            <h1>{t('design.loading')}</h1>
          </VisuallyHidden>
          <Skeleton height="420px" />
        </LoadingStatus>
      )}
      {design.data && <DesignDetails design={design.data} />}
    </Flex>
  );
}
