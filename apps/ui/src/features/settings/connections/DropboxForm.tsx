import { Flex, Link, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { BusyButton } from '../../../shared/BusyButton.js';
import { SecretField } from './SecretField.js';
import { useFinishDropbox, useStartDropbox } from './use-dropbox.js';

/** Two steps: open Dropbox with the app key, then paste the code Dropbox shows. */
export function DropboxForm() {
  const { t } = useTranslation();
  const [appKey, setAppKey] = useState('');
  const [code, setCode] = useState('');
  const start = useStartDropbox();
  const finish = useFinishDropbox();
  const error = start.error ?? finish.error;

  return (
    <Flex direction="column" gap="3" align="start">
      <Text size="2" color="gray">
        {t('settings.connections.dropboxHelp')}
      </Text>
      <Flex asChild direction="column" gap="2" align="start">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate(appKey);
          }}
        >
          <SecretField
            id="dropbox-app-key"
            plain
            label={t('settings.connections.dropboxAppKey')}
            value={appKey}
            onChange={setAppKey}
          />
          <BusyButton
            type="submit"
            busy={start.isPending}
            loading={start.isPending}
            disabled={!appKey.trim()}
          >
            {t('settings.connections.dropboxOpen')}
          </BusyButton>
        </form>
      </Flex>
      {start.data && (
        <Text size="2" role="status">
          {t('settings.connections.dropboxOpened')}{' '}
          <Link href={start.data.authorizeUrl} target="_blank" rel="noreferrer">
            {t('settings.connections.dropboxLink')}
          </Link>
        </Text>
      )}
      {start.isSuccess && (
        <Flex asChild direction="column" gap="2" align="start">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              finish.mutate(code);
            }}
          >
            <SecretField
              id="dropbox-code"
              label={t('settings.connections.dropboxCode')}
              hint={t('settings.connections.dropboxCodeHelp')}
              value={code}
              onChange={setCode}
            />
            <BusyButton
              type="submit"
              busy={finish.isPending}
              loading={finish.isPending}
              disabled={!code.trim()}
            >
              {t('settings.connections.dropboxFinish')}
            </BusyButton>
          </form>
        </Flex>
      )}
      {error && <ErrorCallout error={error} />}
    </Flex>
  );
}
