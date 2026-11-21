import { CheckCircledIcon } from '@radix-ui/react-icons';
import { Flex, Text } from '@radix-ui/themes';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConfirmDialog } from '../../../shared/ConfirmDialog.js';

interface ConnectedRowProps {
  /** Says what is connected, e.g. "Connected to the shop …", so it reads well on its own. */
  readonly label: string;
  /** What disconnecting stops, so the seller is asked first. */
  readonly warning: string;
  readonly busy: boolean;
  readonly onDisconnect: () => void;
  /** Set right after connecting, when the form that had focus disappears. */
  readonly takeFocus: boolean;
}

export function ConnectedRow(props: ConnectedRowProps) {
  const { label, warning, busy, onDisconnect, takeFocus } = props;
  const { t } = useTranslation();
  const disconnect = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (takeFocus) disconnect.current?.focus();
  }, [takeFocus]);

  return (
    <Flex justify="between" align="center" gap="3">
      <Flex align="center" gap="2">
        <Text color="jade">
          <CheckCircledIcon aria-hidden />
        </Text>
        <Text size="2">{label}</Text>
      </Flex>
      <ConfirmDialog
        trigger={
          <BusyButton ref={disconnect} variant="soft" color="gray" busy={busy} loading={busy}>
            {t('settings.connections.disconnect')}
          </BusyButton>
        }
        title={t('settings.connections.disconnectTitle')}
        description={warning}
        confirmLabel={t('settings.connections.disconnect')}
        color="red"
        onConfirm={onDisconnect}
        // The row goes away with the connection, and the connect form takes its place.
        restoreFocus={false}
      />
    </Flex>
  );
}
