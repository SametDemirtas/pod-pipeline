import { AlertDialog, Button, Flex } from '@radix-ui/themes';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  /** The button that opens the dialog. */
  readonly trigger: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly color: 'red' | 'jade';
  readonly onConfirm: () => void;
  /**
   * Whether focus goes back to the trigger after confirming. Off when the
   * trigger goes away with what was confirmed, so the caller places focus.
   */
  readonly restoreFocus?: boolean;
}

/** Asks before an action that cannot be undone or that others will see. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  color,
  onConfirm,
  restoreFocus = true,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmed = useRef(false);

  return (
    <AlertDialog.Root>
      {/* A busy trigger, see BusyButton, keeps the dialog shut by preventing its click. */}
      <AlertDialog.Trigger>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Content
        maxWidth="440px"
        onCloseAutoFocus={(event) => {
          if (confirmed.current && !restoreFocus) event.preventDefault();
          confirmed.current = false;
        }}
      >
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description size="2">{description}</AlertDialog.Description>
        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              {t('common.cancel')}
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button
              color={color}
              onClick={() => {
                confirmed.current = true;
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
