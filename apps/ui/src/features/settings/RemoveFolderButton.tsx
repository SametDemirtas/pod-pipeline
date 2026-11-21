import { useTranslation } from 'react-i18next';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { shortPath } from '../../shared/PathText.js';

interface RemoveFolderButtonProps {
  readonly folder: string;
  /** Another removal runs; the button keeps its focus meanwhile. */
  readonly busy: boolean;
  readonly onConfirm: () => void;
}

/** Removing a folder cannot be undone from here, so it asks first. */
export function RemoveFolderButton({ folder, busy, onConfirm }: RemoveFolderButtonProps) {
  const { t } = useTranslation();
  const name = shortPath(folder, true);

  return (
    <ConfirmDialog
      trigger={
        <BusyButton
          size="1"
          variant="soft"
          color="gray"
          busy={busy}
          aria-label={t('settings.removeFolderLabel', { folder: name })}
          style={{ flexShrink: 0 }}
        >
          {t('settings.removeFolder')}
        </BusyButton>
      }
      title={t('settings.removeFolderTitle', { folder: name })}
      description={t('settings.removeFolderBody')}
      confirmLabel={t('settings.removeFolder')}
      color="red"
      onConfirm={onConfirm}
    />
  );
}
