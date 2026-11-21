import { Flex, Heading } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisconnectRequest } from '@pod/contracts/client';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { ConnectedRow } from './ConnectedRow.js';
import { useDisconnect } from './use-connection-calls.js';
import { useJustConnected } from './use-connection-change.js';

type Service = DisconnectRequest['service'];

/** What the seller loses by disconnecting, by how the service is connected again. */
const DISCONNECT_WARNINGS = {
  printful: 'disconnectKey',
  fileHost: 'disconnectKey',
  anthropic: 'disconnectKey',
  openai: 'disconnectKey',
  deepseek: 'disconnectKey',
  kimi: 'disconnectKey',
  gemini: 'disconnectKey',
  etsy: 'disconnectSignIn',
  pinterest: 'disconnectPins',
} as const satisfies Record<Service, string>;

interface ConnectionSectionProps {
  readonly service: Service;
  /** Left out when the surrounding section names the service. */
  readonly title?: string | undefined;
  /** What is connected, e.g. the shop's name; `null` while nothing is. */
  readonly connectedAs: string | null;
  /** Shown under the title either way. */
  readonly intro?: ReactNode;
  /** Shown under the connected row, e.g. a model choice. */
  readonly connectedExtra?: ReactNode;
  /** Why connecting failed, shown below the form. */
  readonly error?: unknown;
  /** The form that connects the service, shown while it is not connected. */
  readonly children: ReactNode;
}

/** One service in the settings: its connect form, or what is connected and a way to disconnect. */
export function ConnectionSection(props: ConnectionSectionProps) {
  const { t } = useTranslation();
  const disconnect = useDisconnect(props.service);
  const justConnected = useJustConnected(props.connectedAs !== null);
  const error = props.error ?? disconnect.error;

  return (
    <Flex direction="column" gap="2">
      {props.title && (
        <Heading as="h3" size="3">
          {props.title}
        </Heading>
      )}
      {props.intro}
      {props.connectedAs === null ? (
        props.children
      ) : (
        <>
          <ConnectedRow
            label={props.connectedAs}
            warning={t(`settings.connections.${DISCONNECT_WARNINGS[props.service]}`)}
            busy={disconnect.isPending}
            takeFocus={justConnected}
            onDisconnect={() => {
              disconnect.mutate(undefined);
            }}
          />
          {props.connectedExtra}
        </>
      )}
      {error !== null && <ErrorCallout error={error} />}
    </Flex>
  );
}
