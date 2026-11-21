import { Flex, Progress, Text, VisuallyHidden } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { ImportProgressDto } from '@pod/contracts/client';

/**
 * Progress of the running phase, or an indeterminate bar until the first
 * event. Screen readers hear when the phase changes, not every file.
 */
export function ImportProgress({ progress }: { progress: ImportProgressDto | null }) {
  const { t } = useTranslation();
  // Importing reads the folder again first, to be sure it is still what was reviewed.
  const step =
    progress?.phase === 'copying'
      ? 'copying'
      : progress?.operation === 'import'
        ? 'verifying'
        : 'reading';
  const detail = progress
    ? t(`import.${step}`, { done: progress.done, total: progress.total })
    : t('import.preparing');
  const phase = t(`import.${step}Phase`);
  const value = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : null;

  return (
    <Flex direction="column" gap="2" py="4">
      <VisuallyHidden aria-live="polite">{progress ? phase : ''}</VisuallyHidden>
      <Text size="2" aria-hidden>
        {detail}
      </Text>
      <Progress value={value} aria-label={t('import.progressLabel')} aria-valuetext={detail} />
    </Flex>
  );
}
