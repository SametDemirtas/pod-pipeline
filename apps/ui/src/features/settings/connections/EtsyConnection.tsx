import { Code } from '@radix-ui/themes';
import { Trans, useTranslation } from 'react-i18next';
import { ETSY_CALLBACK_URL, type ConnectionsDto } from '@pod/contracts/client';
import { BrowserSignInConnection } from './BrowserSignInConnection.js';
import { EtsyNotice } from './EtsyNotice.js';
import { useBrowserSignIn } from './use-connection-calls.js';

/** Sign-in with the seller's own Etsy app, finished in the browser. */
export function EtsyConnection({ connections }: { connections: ConnectionsDto }) {
  const { t } = useTranslation();
  const signIn = useBrowserSignIn('etsy');

  return (
    <BrowserSignInConnection
      id="etsy"
      service="etsy"
      reconnect={connections.reconnect?.includes('etsy') === true}
      connectedAs={
        connections.etsy
          ? t('settings.connections.etsyConnected', { shop: connections.etsy.shopName })
          : null
      }
      notice={<EtsyNotice />}
      help={
        <Trans
          i18nKey="settings.connections.etsyHelp"
          values={{ url: ETSY_CALLBACK_URL }}
          components={{ url: <Code variant="ghost" /> }}
        />
      }
      texts={{
        title: t('settings.connections.etsyTitle'),
        idLabel: t('settings.connections.etsyKeystring'),
        secretLabel: t('settings.connections.etsySharedSecret'),
        signIn: t('settings.connections.etsySignIn'),
        waiting: t('settings.connections.signInWaiting'),
      }}
      connect={signIn.connect}
      cancel={signIn.cancel}
    />
  );
}
