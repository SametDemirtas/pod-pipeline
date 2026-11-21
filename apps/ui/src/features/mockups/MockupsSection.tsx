import { Flex, Heading, Skeleton, Spinner, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrintRequest, PrintVariantDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { useChosenAi } from '../../shared/use-ai.js';
import { missingConnection } from '../../shared/missing-connection.js';
import { MockupGallery } from './MockupGallery.js';
import { useCreateMockups, useMockupRun, useMockups } from './use-mockups.js';

interface MockupsSectionProps {
  readonly request: PrintRequest;
  /** False until the print check for this request came back. */
  readonly canCreate: boolean;
  /** The print check failed, so mockups wait until it works. */
  readonly checkFailed: boolean;
  readonly variants: readonly PrintVariantDto[];
  readonly designKey: string;
  readonly familyId: string;
  /** The design's current revision; photos of earlier ones are marked. */
  readonly revision: number;
}

export function MockupsSection(props: MockupsSectionProps) {
  const { request, canCreate, checkFailed, variants, designKey, familyId, revision } = props;
  const { t } = useTranslation();
  const reasonId = useId();
  const mockups = useMockups(request.designId);
  const create = useCreateMockups(request.designId);
  const run = useMockupRun(request.designId);
  const ai = useChosenAi();
  const photos = mockups.data ?? [];
  const hasMockups = photos.length > 0;
  const missing = missingConnection(run.error);

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('mockups.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('mockups.help')}
      </Text>
      <Flex gap="3" align="center" wrap="wrap">
        <BusyButton
          disabled={!canCreate}
          busy={run.running}
          aria-describedby={checkFailed ? reasonId : undefined}
          onClick={() => {
            create.mutate(request);
          }}
        >
          <Spinner loading={run.running} />
          {t(hasMockups ? 'mockups.createAgain' : 'mockups.create')}
        </BusyButton>
        <Text size="2" color="gray" role="status">
          {run.running ? t('mockups.creating') : run.succeeded ? t('mockups.ready') : ''}
        </Text>
      </Flex>
      {checkFailed && (
        <Text id={reasonId} size="2" color="gray">
          {t('mockups.needsPrintCheck')}
        </Text>
      )}
      {missing ? (
        <ConnectionNotice {...missing} />
      ) : (
        run.error && <ErrorCallout error={run.error} />
      )}
      {mockups.isPending && (
        <LoadingStatus label={t('mockups.loading')}>
          <Skeleton height="160px" />
        </LoadingStatus>
      )}
      {mockups.isError && (
        <ErrorCallout error={mockups.error} onRetry={() => void mockups.refetch()} />
      )}
      {mockups.data?.length === 0 && <Text size="2">{t('mockups.empty')}</Text>}
      {hasMockups && (
        <MockupGallery
          designId={request.designId}
          familyId={familyId}
          mockups={photos}
          variants={variants}
          designKey={designKey}
          revision={revision}
          scenes={ai.scenes.connected}
        />
      )}
    </Flex>
  );
}
