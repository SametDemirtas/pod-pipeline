import { ExternalLinkIcon } from '@radix-ui/react-icons';
import { Flex, Link } from '@radix-ui/themes';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiErrorCode, PinDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useApprovePin, usePublishPin, useRemovePin } from './use-pins.js';

/** An earlier attempt may have reached Pinterest, so trying again could post the pin twice. */
const OUTCOME_UNKNOWN: ApiErrorCode = 'PIN_OUTCOME_UNKNOWN';

interface PinActionsProps {
  readonly pin: PinDto;
  /** The pin's row, which keeps the focus when the button pressed goes away. */
  readonly row: RefObject<HTMLLIElement | null>;
  /** Places the focus once the pin, and its row with it, is gone. */
  readonly onRemoved: () => void;
}

/** What can be done with the pin now, and why the last attempt failed. */
export function PinActions({ pin, row, onRemoved }: PinActionsProps) {
  const { t } = useTranslation();
  const approve = useApprovePin(pin.designId);
  const publish = usePublishPin(pin.designId);
  const remove = useRemovePin(pin.designId, onRemoved);
  const busy =
    approve.isPending || publish.isPending || remove.isPending || pin.state === 'publishing';
  const error = approve.error ?? publish.error ?? remove.error;
  // A new action replaces the message an earlier one left.
  const clearErrors = () => {
    approve.reset();
    publish.reset();
    remove.reset();
  };

  return (
    <>
      <Flex gap="2" mt="1" wrap="wrap">
        {pin.state === 'proposed' && (
          <BusyButton
            size="1"
            loading={approve.isPending}
            busy={busy}
            onClick={() => {
              clearErrors();
              // The button goes away once approved, so the pin keeps the focus.
              approve.mutate(pin.id, { onSuccess: () => row.current?.focus() });
            }}
          >
            {t('pins.approve')}
          </BusyButton>
        )}
        {(pin.state === 'planned' || pin.state === 'failed') && (
          <PublishButton
            pin={pin}
            loading={publish.isPending}
            busy={busy}
            onConfirm={(confirmUnknown) => {
              clearErrors();
              // The button may go away once published, so the pin keeps the focus.
              publish.mutate(
                { id: pin.id, ...(confirmUnknown && { confirmUnknown }) },
                { onSettled: () => row.current?.focus() },
              );
            }}
          />
        )}
        {pin.publishedUrl && (
          <Link size="2" href={pin.publishedUrl} target="_blank" rel="noreferrer">
            {t('pins.open')} <ExternalLinkIcon />
          </Link>
        )}
        <RemovePinButton
          pin={pin}
          busy={busy}
          onConfirm={() => {
            clearErrors();
            remove.mutate(pin.id);
          }}
        />
      </Flex>
      {error && <ErrorCallout error={error} />}
    </>
  );
}

interface PinActionProps {
  readonly pin: PinDto;
  /** Another action runs, or the pin is being sent; the button keeps its focus meanwhile. */
  readonly busy: boolean;
}

interface PublishButtonProps extends PinActionProps {
  readonly loading: boolean;
  /** `confirmUnknown` is set once the seller agreed to send a pin that may already be up. */
  readonly onConfirm: (confirmUnknown: boolean) => void;
}

/** Publishes a planned pin now, or tries a failed one again; asks first when that is risky. */
function PublishButton({ pin, loading, busy, onConfirm }: PublishButtonProps) {
  const { t } = useTranslation();
  const risky = pin.failureCode === OUTCOME_UNKNOWN;
  const button = (
    <BusyButton
      size="1"
      variant="soft"
      loading={loading}
      busy={busy}
      onClick={
        risky
          ? undefined
          : () => {
              onConfirm(false);
            }
      }
    >
      {t(pin.state === 'failed' ? 'pins.retry' : 'pins.publishNow')}
    </BusyButton>
  );
  if (!risky) return button;
  return (
    <ConfirmDialog
      trigger={button}
      title={t('pins.retryTitle')}
      description={t('pins.retryUnknown')}
      confirmLabel={t('pins.retryConfirm')}
      color="red"
      onConfirm={() => {
        onConfirm(true);
      }}
      restoreFocus={false}
    />
  );
}

/** Removing forgets the pin in the app; a published one stays on Pinterest, so it asks first. */
function RemovePinButton({
  pin,
  busy,
  onConfirm,
}: PinActionProps & { readonly onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      trigger={
        <BusyButton
          size="1"
          variant="ghost"
          color="gray"
          busy={busy}
          aria-label={t('pins.removeLabel', { title: pin.title })}
        >
          {t('pins.remove')}
        </BusyButton>
      }
      title={t('pins.removeTitle')}
      description={t(pin.state === 'published' ? 'pins.removePublished' : 'pins.removePlanned')}
      confirmLabel={t('pins.remove')}
      color="red"
      onConfirm={onConfirm}
    />
  );
}
