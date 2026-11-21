import { Code } from '@radix-ui/themes';
import { Trans, useTranslation } from 'react-i18next';
import { PINTEREST_CALLBACK_URL, type ConnectionsDto } from '@pod/contracts/client';
import { BrowserSignInConnection } from './BrowserSignInConnection.js';
import { useBrowserSignIn } from './use-connection-calls.js';

/** Sign-in with the seller's own Pinterest app, finished in the browser. */
export function PinterestConnection({ connections }: { connections: ConnectionsDto }) {
  const { t } = useTranslation();
  const signIn = useBrowserSignIn('pinterest');

  return (
    <BrowserSignInConnection
      id="pinterest"
      service="pinterest"
      reconnect={connections.reconnect?.includes('pinterest') === true}
      connectedAs={
        connections.pinterest
          ? t('settings.connections.pinterestConnected', {
              account: connections.pinterest.username,
            })
          : null
      }
      help={
        <Trans
          i18nKey="settings.connections.pinterestHelp"
          values={{ url: PINTEREST_CALLBACK_URL }}
          components={{ url: <Code variant="ghost" /> }}
        />
      }
      texts={{
        title: t('settings.connections.pinterestTitle'),
        idLabel: t('settings.connections.pinterestAppId'),
        secretLabel: t('settings.connections.pinterestAppSecret'),
        signIn: t('settings.connections.pinterestSignIn'),
        waiting: t('settings.connections.signInWaiting'),
      }}
      connect={signIn.connect}
      cancel={signIn.cancel}
    />
  );
}
