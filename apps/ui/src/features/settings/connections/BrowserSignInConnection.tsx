import { Callout, Flex, Text } from '@radix-ui/themes';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectionsDto, DisconnectRequest } from '@pod/contracts/client';
import { queryKeys } from '../../../api/query-keys.js';
import { useLatestMutation } from '../../../shared/use-latest-mutation.js';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConnectionSection } from './ConnectionSection.js';
import { SecretField } from './SecretField.js';
import { useConnectionChange } from './use-connection-change.js';

/** The seller's own app on the service: its public id and its secret. */
interface AppCredentials {
  readonly id: string;
  readonly secret: string;
}

interface BrowserSignInTexts {
  readonly title: string;
  readonly idLabel: string;
  readonly secretLabel: string;
  readonly signIn: string;
  readonly waiting: string;
}

interface BrowserSignInConnectionProps {
  readonly id: string;
  readonly service: DisconnectRequest['service'];
  /** What is connected, e.g. the shop's name; `null` while nothing is. */
  readonly connectedAs: string | null;
  /** The renewed sign-in could not be saved, so the seller connects again to be safe. */
  readonly reconnect: boolean;
  readonly help: ReactNode;
  /** Shown under the title whether or not the service is connected. */
  readonly notice?: ReactNode;
  readonly texts: BrowserSignInTexts;
  readonly connect: (app: AppCredentials) => Promise<ConnectionsDto>;
  readonly cancel: () => Promise<ConnectionsDto>;
}

/** A service the seller connects with their own app, finishing the sign-in in the browser. */
export function BrowserSignInConnection(props: BrowserSignInConnectionProps) {
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const mutationKey = queryKeys.signIn(props.service);
  const connect = useConnectionChange(props.connect, mutationKey);
  // The sign-in outlives this form when the seller leaves the settings and comes back.
  const { running: signingIn, error: signInError } = useLatestMutation(mutationKey);
  const [cancelled, setCancelled] = useState(false);
  const cancel = useConnectionChange(props.cancel);
  const { texts } = props;

  return (
    <ConnectionSection
      service={props.service}
      title={texts.title}
      intro={props.notice}
      connectedAs={props.connectedAs}
      connectedExtra={props.reconnect && <SignInNotSaved service={texts.title} />}
      error={(cancelled ? null : signInError) ?? cancel.error}
    >
      <Flex asChild direction="column" gap="2" align="start">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCancelled(false);
            cancel.reset();
            connect.mutate(
              { id: appId, secret },
              {
                onSuccess: () => {
                  setAppId('');
                  setSecret('');
                },
              },
            );
          }}
        >
          <Text size="2" color="gray">
            {props.help}
          </Text>
          <SecretField
            id={`${props.id}-app-id`}
            plain
            label={texts.idLabel}
            value={appId}
            onChange={setAppId}
          />
          <SecretField
            id={`${props.id}-secret`}
            label={texts.secretLabel}
            value={secret}
            onChange={setSecret}
          />
          <SignInActions
            label={texts.signIn}
            signingIn={signingIn}
            ready={appId.trim() !== '' && secret.trim() !== ''}
            cancelling={cancel.isPending}
            onCancel={() => {
              setCancelled(true);
              cancel.mutate(undefined);
            }}
          />
          <Text size="2" role="status">
            {signingIn ? texts.waiting : ''}
          </Text>
        </form>
      </Flex>
    </ConnectionSection>
  );
}

function SignInNotSaved({ service }: { service: string }) {
  const { t } = useTranslation();
  return (
    <Callout.Root color="amber" size="1" role="status">
      <Callout.Text>{t('settings.connections.signInNotSaved', { service })}</Callout.Text>
    </Callout.Root>
  );
}

interface SignInActionsProps {
  readonly label: string;
  readonly signingIn: boolean;
  /** Both the app id and the secret are filled in. */
  readonly ready: boolean;
  readonly cancelling: boolean;
  readonly onCancel: () => void;
}

function SignInActions({ label, signingIn, ready, cancelling, onCancel }: SignInActionsProps) {
  const { t } = useTranslation();
  return (
    <Flex gap="2">
      <BusyButton type="submit" busy={signingIn} loading={signingIn} disabled={!ready}>
        {label}
      </BusyButton>
      {signingIn && (
        <BusyButton
          type="button"
          variant="soft"
          color="gray"
          busy={cancelling}
          loading={cancelling}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </BusyButton>
      )}
    </Flex>
  );
}
