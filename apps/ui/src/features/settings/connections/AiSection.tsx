import { Flex, Heading, Link, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AI_KEY_PAGES,
  type AiCatalogDto,
  type AiProvider,
  type ConnectionsDto,
} from '@pod/contracts/client';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { LabeledSelect } from '../../../shared/LabeledSelect.js';
import { ApiKeyConnection } from './ApiKeyConnection.js';
import { useAiConnect } from './use-connection-calls.js';

interface AiSectionProps<P extends AiProvider> {
  /** Tells this section's fields apart from the other AI section's. */
  readonly id: string;
  readonly title: string;
  readonly help: string;
  readonly providers: readonly P[];
  readonly provider: P;
  readonly catalog: AiCatalogDto;
  readonly connections: ConnectionsDto;
  readonly busy: boolean;
  /** Why saving a choice failed. */
  readonly error: unknown;
  readonly onProviderChange: (provider: P) => void;
  /** The model choices, shown once the service is connected. */
  readonly children: ReactNode;
}

/** One use of AI: the service the seller picks for it, its key and its models. */
export function AiSection<P extends AiProvider>(props: AiSectionProps<P>) {
  const { provider, catalog } = props;
  const { t } = useTranslation();
  const connect = useAiConnect(provider);
  const service = catalog[provider].service;

  return (
    <Flex direction="column" gap="2">
      <Heading as="h3" size="3">
        {props.title}
      </Heading>
      <Text size="2" color="gray">
        {props.help}
      </Text>
      <LabeledSelect
        label={t('settings.ai.provider')}
        value={provider}
        busy={props.busy}
        minWidth={240}
        options={props.providers.map((option) => ({
          value: option,
          label: catalog[option].service,
        }))}
        onChange={(value) => {
          const chosen = props.providers.find((option) => option === value);
          if (chosen) props.onProviderChange(chosen);
        }}
      />
      {props.error !== null && <ErrorCallout error={props.error} />}
      <ApiKeyConnection
        // Each service starts with an empty key field of its own.
        key={provider}
        id={`${props.id}-${provider}-key`}
        service={provider}
        connectedAs={
          props.connections.ai[provider] ? t('settings.ai.connected', { service }) : null
        }
        connect={connect}
        texts={{
          help: (
            <>
              {t(`settings.ai.providers.${provider}`)}{' '}
              <Link href={AI_KEY_PAGES[provider]} target="_blank" rel="noreferrer">
                {t('settings.ai.keyPage')}
              </Link>
            </>
          ),
          keyLabel: t(`settings.ai.keys.${provider}`),
          connect: t('settings.ai.connect', { service }),
        }}
      >
        {props.children}
      </ApiKeyConnection>
    </Flex>
  );
}
