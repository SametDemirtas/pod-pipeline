import { Flex, Heading, Separator, Skeleton, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../../shared/LoadingStatus.js';
import { useConnections } from '../../../shared/use-connections.js';
import { AiSettings } from './AiSettings.js';
import { EtsyConnection } from './EtsyConnection.js';
import { FileHostConnection } from './FileHostConnection.js';
import { PinterestConnection } from './PinterestConnection.js';
import { PrintfulConnection } from './PrintfulConnection.js';

/** Printful, the file host it reads designs from, the Etsy shop, the AI services and Pinterest. */
export function ConnectionsSetting() {
  const { t } = useTranslation();
  const connections = useConnections();

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('settings.connections.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.connections.help')}
      </Text>
      {connections.isPending && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {connections.isError && (
        <ErrorCallout error={connections.error} onRetry={() => void connections.refetch()} />
      )}
      {connections.data && (
        <>
          <PrintfulConnection connections={connections.data} />
          <Separator size="4" />
          <FileHostConnection connections={connections.data} />
          <Separator size="4" />
          <EtsyConnection connections={connections.data} />
          <Separator size="4" />
          <AiSettings connections={connections.data} />
          <Separator size="4" />
          <PinterestConnection connections={connections.data} />
        </>
      )}
    </Flex>
  );
}
