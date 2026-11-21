import { TrashIcon } from '@radix-ui/react-icons';
import { useTranslation } from 'react-i18next';
import { BusyIconButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';

interface RemovePhotoButtonProps {
  readonly photo: string;
  /** Another removal runs; the button keeps its focus meanwhile. */
  readonly busy: boolean;
  readonly onConfirm: () => void;
}

/** A removed photo, and a scene paid for, cannot be brought back, so it asks first. */
export function RemovePhotoButton({ photo, busy, onConfirm }: RemovePhotoButtonProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      trigger={
        <BusyIconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label={t('mockups.remove', { photo })}
          busy={busy}
        >
          <TrashIcon />
        </BusyIconButton>
      }
      title={t('mockups.removeTitle')}
      description={photo}
      confirmLabel={t('mockups.removeConfirm')}
      color="red"
      onConfirm={onConfirm}
      // The button goes away with the photo, so the gallery takes the focus instead.
      restoreFocus={false}
    />
  );
}
