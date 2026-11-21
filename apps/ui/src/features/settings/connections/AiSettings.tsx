import { Separator, Skeleton } from '@radix-ui/themes';
import type { ConnectionsDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../../shared/LoadingStatus.js';
import { useSettings } from '../../../shared/use-settings.js';
import { useAiCatalog } from '../../../shared/use-ai.js';
import { ImageAiSetting } from './ImageAiSetting.js';
import { TextAiSetting } from './TextAiSetting.js';

/** The AI services that write text and make scenes, each with its key and models. */
export function AiSettings({ connections }: { connections: ConnectionsDto }) {
  const settings = useSettings();
  const catalog = useAiCatalog();

  if (settings.isError || catalog.isError) {
    return (
      <ErrorCallout
        error={settings.error ?? catalog.error}
        onRetry={() => {
          void settings.refetch();
          void catalog.refetch();
        }}
      />
    );
  }
  if (!settings.data || !catalog.data) {
    return (
      <LoadingStatus>
        <Skeleton height="96px" />
      </LoadingStatus>
    );
  }
  const props = { settings: settings.data, catalog: catalog.data, connections };
  return (
    <>
      <TextAiSetting {...props} />
      <Separator size="4" />
      <ImageAiSetting {...props} />
    </>
  );
}
