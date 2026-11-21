import { Flex, Text } from '@radix-ui/themes';
import { useState, type ReactNode } from 'react';
import type { ConnectionsDto, DisconnectRequest } from '@pod/contracts/client';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConnectionSection } from './ConnectionSection.js';
import { SecretField } from './SecretField.js';
import { useConnectionChange } from './use-connection-change.js';

interface ApiKeyConnectionTexts {
  /** Left out when the surrounding section names the service. */
  readonly title?: string;
  /** Where the key comes from, shown with the form. */
  readonly help: ReactNode;
  readonly keyLabel: string;
  readonly connect: string;
}

interface ApiKeyConnectionProps {
  readonly id: string;
  /** What is connected, e.g. the store's name; `null` while nothing is. */
  readonly connectedAs: string | null;
  readonly service: DisconnectRequest['service'];
  readonly texts: ApiKeyConnectionTexts;
  readonly connect: (apiKey: string) => Promise<ConnectionsDto>;
  /** Shown under the connected row, e.g. a model choice. */
  readonly children?: ReactNode;
}

/** A service the seller connects with one API key or token of their own. */
export function ApiKeyConnection(props: ApiKeyConnectionProps) {
  const [apiKey, setApiKey] = useState('');
  const connect = useConnectionChange(props.connect);
  const { texts } = props;

  return (
    <ConnectionSection
      service={props.service}
      title={texts.title}
      connectedAs={props.connectedAs}
      connectedExtra={props.children}
      error={connect.error}
    >
      <Flex asChild direction="column" gap="2" align="start">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            connect.mutate(apiKey, {
              onSuccess: () => {
                setApiKey('');
              },
            });
          }}
        >
          <Text size="2" color="gray">
            {texts.help}
          </Text>
          <SecretField id={props.id} label={texts.keyLabel} value={apiKey} onChange={setApiKey} />
          <BusyButton
            type="submit"
            busy={connect.isPending}
            loading={connect.isPending}
            disabled={!apiKey.trim()}
          >
            {texts.connect}
          </BusyButton>
        </form>
      </Flex>
    </ConnectionSection>
  );
}
