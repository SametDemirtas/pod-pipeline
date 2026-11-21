import { Callout } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { ConnectionsDto } from '@pod/contracts/client';
import { ApiKeyConnection } from './ApiKeyConnection.js';
import { usePrintfulConnect } from './use-connection-calls.js';

/** The seller's Printful store token, which products and mockups come from. */
export function PrintfulConnection({ connections }: { connections: ConnectionsDto }) {
  const { t } = useTranslation();
  const connect = usePrintfulConnect();
  const { printful, etsy } = connections;
  const problem = printful?.storeProblem;
  return (
    <ApiKeyConnection
      id="printful-token"
      service="printful"
      connectedAs={
        printful ? t('settings.connections.printfulConnected', { store: printful.storeName }) : null
      }
      connect={connect}
      texts={{
        title: t('settings.connections.printfulTitle'),
        help: t('settings.connections.printfulHelp'),
        keyLabel: t('settings.connections.printfulToken'),
        connect: t('settings.connections.connect'),
      }}
    >
      {printful && problem && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>
            {problem === 'not-marketplace'
              ? t('settings.connections.printfulNotEtsy', { store: printful.storeName })
              : t('settings.connections.printfulOtherShop', {
                  store: printful.storeName,
                  shop: etsy?.shopName ?? '',
                })}
          </Callout.Text>
        </Callout.Root>
      )}
    </ApiKeyConnection>
  );
}
