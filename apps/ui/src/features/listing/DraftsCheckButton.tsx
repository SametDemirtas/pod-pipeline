import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import type { DraftsCheck } from './use-drafts-check.js';

interface DraftsCheckButtonProps {
  readonly check: DraftsCheck;
  readonly busy: boolean;
  readonly loading: boolean;
  readonly onCreate: () => void;
}

/**
 * Creates the draft, first asking whether the shop's drafts were checked when
 * Etsy may already hold one.
 */
export function DraftsCheckButton({ check, busy, loading, onCreate }: DraftsCheckButtonProps) {
  const { t } = useTranslation();
  const createRef = useRef<HTMLButtonElement>(null);
  const button = (
    <BusyButton
      ref={createRef}
      type={check.ask ? 'button' : 'submit'}
      busy={busy}
      loading={loading}
    >
      {t('listing.create')}
    </BusyButton>
  );
  if (!check.ask) return button;

  return (
    <ConfirmDialog
      trigger={button}
      title={t('common.draftsCheckTitle')}
      description={t('common.draftsCheckBody')}
      confirmLabel={t('common.draftsChecked')}
      color="jade"
      // The button leaves the dialog once the question is answered, so it is focused anew.
      restoreFocus={false}
      onConfirm={() => {
        // The app holds back drafts of the design until the seller says the shop was checked.
        check.confirm(onCreate);
        requestAnimationFrame(() => createRef.current?.focus());
      }}
    />
  );
}
