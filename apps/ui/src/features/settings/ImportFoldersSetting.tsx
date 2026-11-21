import { Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { PathText } from '../../shared/PathText.js';
import { RemoveFolderButton } from './RemoveFolderButton.js';
import { useImportFolders, useRemoveImportFolder } from './use-import-folders.js';

/** Folders approved for importing; the only ones automatic imports may use. */
export function ImportFoldersSetting() {
  const { t } = useTranslation();
  const folders = useImportFolders();
  const remove = useRemoveImportFolder();

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="4">
        {t('settings.foldersTitle')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.foldersHelp')}
      </Text>
      {folders.isPending && (
        <LoadingStatus>
          <Skeleton height="32px" />
        </LoadingStatus>
      )}
      {folders.isError && (
        <ErrorCallout error={folders.error} onRetry={() => void folders.refetch()} />
      )}
      {folders.data?.length === 0 && <Text size="2">{t('settings.foldersEmpty')}</Text>}
      {folders.data && folders.data.length > 0 && (
        <Flex asChild direction="column" gap="2">
          <ul aria-label={t('settings.foldersTitle')} style={{ listStyle: 'none', padding: 0 }}>
            {folders.data.map((folder) => (
              <Flex asChild key={folder} justify="between" align="center" gap="3">
                <li>
                  <PathText path={folder} folder />
                  <RemoveFolderButton
                    folder={folder}
                    busy={remove.isPending}
                    onConfirm={() => {
                      remove.mutate(folder);
                    }}
                  />
                </li>
              </Flex>
            ))}
          </ul>
        </Flex>
      )}
      {remove.isError && <ErrorCallout error={remove.error} />}
    </Flex>
  );
}
