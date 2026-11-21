import { Dialog, VisuallyHidden } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { ImportStepView, PRIMARY_ACTION } from './ImportStepView.js';
import { useImportFlow } from './use-import-flow.js';

interface ImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Wizard that checks a folder, shows what would change and imports on
 * confirmation. Controlled by the page, so it stays open while the page
 * behind it changes, as it does after the very first import.
 */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { t } = useTranslation();
  const flow = useImportFlow();

  function changeOpen(next: boolean) {
    if (flow.busy) return;
    onOpenChange(next);
    if (!next) flow.reset();
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Content
        maxWidth="720px"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          const content = event.currentTarget as HTMLElement;
          const primary = content.querySelector<HTMLElement>(`[${PRIMARY_ACTION}]`);
          if (!primary) return;
          event.preventDefault();
          primary.focus();
        }}
      >
        <Dialog.Title>{t('import.title')}</Dialog.Title>
        <VisuallyHidden aria-live="polite">{t(`import.steps.${flow.state.step}`)}</VisuallyHidden>
        <ImportStepView
          state={flow.state}
          progress={flow.progress}
          onChooseFolder={() => void flow.chooseFolder()}
          onCheckAgain={(rootPath) => void flow.check(rootPath)}
          onConfirm={() => void flow.confirm()}
          onClose={() => {
            changeOpen(false);
          }}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}
