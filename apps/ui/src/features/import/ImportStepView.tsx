import type { TFunction } from 'i18next';
import { Button, Callout, Flex, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportProgressDto, ImportResultDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { formatList } from '../../shared/format.js';
import { hasWork, type ImportState } from './import-flow.js';
import { ImportIntro } from './ImportIntro.js';
import { ImportProgress } from './ImportProgress.js';
import { PreviewSummary } from './PreviewSummary.js';

/** Attribute marking the button the dialog focuses when it opens. */
export const PRIMARY_ACTION = 'data-primary-action';

interface ImportStepViewProps {
  readonly state: ImportState;
  readonly progress: ImportProgressDto | null;
  readonly onChooseFolder: () => void;
  readonly onCheckAgain: (rootPath: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

/** Renders the body and actions of the current wizard step. */
export function ImportStepView(props: ImportStepViewProps) {
  const { t, i18n } = useTranslation();
  const { state } = props;
  const close = (
    <Button key="close" variant="soft" color="gray" onClick={props.onClose}>
      {t('common.cancel')}
    </Button>
  );

  switch (state.step) {
    case 'choose':
      return (
        <Step
          actions={[
            close,
            <ChooseButton
              key="choose"
              state={state}
              onChooseFolder={props.onChooseFolder}
              primary
            />,
          ]}
        >
          <ImportIntro />
        </Step>
      );
    case 'checking':
    case 'importing':
      return (
        <Step actions={[]}>
          <ImportProgress progress={props.progress} />
        </Step>
      );
    case 'review':
      return (
        <Step actions={reviewActions(t, state, close, props)}>
          <ReviewBody state={state} />
        </Step>
      );
    case 'done':
      return (
        <Step
          actions={[
            // The import buttons went away while it ran, so the focus starts here again.
            <Button key="close" onClick={props.onClose} data-primary-action autoFocus>
              {t('import.close')}
            </Button>,
          ]}
        >
          <Text>{doneSummary(t, state.result, i18n.language)}</Text>
        </Step>
      );
    case 'failed':
      return (
        <Step actions={failedActions(t, state, close, props)}>
          <ErrorCallout error={state.error} />
        </Step>
      );
  }
}

function Step({ children, actions }: { children: ReactNode; actions: ReactNode[] }) {
  return (
    <Flex direction="column" gap="4" mt="2">
      {children}
      {actions.some(Boolean) && (
        <Flex gap="3" justify="end" wrap="wrap">
          {actions}
        </Flex>
      )}
    </Flex>
  );
}

type ReviewState = Extract<ImportState, { step: 'review' }>;

function reviewActions(
  t: TFunction,
  state: ReviewState,
  close: ReactNode,
  { onChooseFolder, onConfirm }: Pick<ImportStepViewProps, 'onChooseFolder' | 'onConfirm'>,
): ReactNode[] {
  const { counts } = state.preview;
  const pending = counts.new + counts.changed;
  return [
    close,
    <ChooseButton key="choose" state={state} onChooseFolder={onChooseFolder} />,
    hasWork(state.preview) && (
      <Button key="confirm" onClick={onConfirm} data-primary-action>
        {pending > 0 ? t('import.confirm', { count: pending }) : t('import.applyRenames')}
      </Button>
    ),
  ];
}

function ReviewBody({ state }: { state: ReviewState }) {
  const { t } = useTranslation();
  return (
    <>
      <PreviewSummary preview={state.preview} />
      {!hasWork(state.preview) && (
        <Callout.Root color="gray">
          <Callout.Text>{t('import.nothingToImport')}</Callout.Text>
        </Callout.Root>
      )}
    </>
  );
}

function failedActions(
  t: TFunction,
  state: Extract<ImportState, { step: 'failed' }>,
  close: ReactNode,
  { onChooseFolder, onCheckAgain }: Pick<ImportStepViewProps, 'onChooseFolder' | 'onCheckAgain'>,
): ReactNode[] {
  const { rootPath } = state;
  return [
    close,
    <ChooseButton
      key="choose"
      state={state}
      onChooseFolder={onChooseFolder}
      primary={rootPath === null}
    />,
    rootPath !== null && (
      <Button
        key="again"
        onClick={() => {
          onCheckAgain(rootPath);
        }}
      >
        {t('import.previewAgain')}
      </Button>
    ),
  ];
}

interface ChooseButtonProps extends Pick<ImportStepViewProps, 'state' | 'onChooseFolder'> {
  readonly primary?: boolean;
}

function ChooseButton({ state, onChooseFolder, primary = false }: ChooseButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      variant={primary ? 'solid' : 'soft'}
      {...(primary ? {} : { color: 'gray' as const })}
      onClick={onChooseFolder}
      data-primary-action={primary ? '' : undefined}
    >
      {t(state.step === 'choose' ? 'import.chooseFolder' : 'import.chooseAnother')}
    </Button>
  );
}

/** "3 designs added and 2 files skipped": only the counts that are not zero. */
function doneSummary(t: TFunction, result: ImportResultDto, locale: string): string {
  const parts = [
    result.created.length > 0 && t('import.doneAdded', { count: result.created.length }),
    result.updated.length > 0 && t('import.doneUpdated', { count: result.updated.length }),
    result.renamedConceptKeys.length > 0 &&
      t('import.doneRenamed', { count: result.renamedConceptKeys.length }),
    result.skipped > 0 && t('import.doneSkipped', { count: result.skipped }),
  ].filter((part): part is string => typeof part === 'string');
  return formatList(parts, locale);
}
