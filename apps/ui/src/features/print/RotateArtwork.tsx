import { Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { DesignDetailDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useRotate, useRotateRun } from './use-rotate.js';

interface RotateArtworkProps {
  readonly design: DesignDetailDto;
  /** The check found the artwork would fill the area better turned a quarter. */
  readonly turnsToFit: boolean;
}

/**
 * Offers to turn artwork whose orientation is the other one than the print
 * area's, and says how far it was turned and why, or why it was left as it is.
 */
export function RotateArtwork({ design, turnsToFit }: RotateArtworkProps) {
  const { t } = useTranslation();
  const rotate = useRotate(design.id);
  const run = useRotateRun(design.id);

  if (design.rotation !== null) {
    return (
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">
          {t('print.rotate.done', { degrees: design.rotation })}
        </Text>
        {design.rotationReason !== null && (
          <Text size="2" color="gray">
            {t('print.rotate.reason', { reason: design.rotationReason })}
          </Text>
        )}
      </Flex>
    );
  }
  // The advice is saved with the design, so it shows on every visit, not only after asking.
  const kept = run.result?.status === 'kept' ? run.result.reason : design.keptOrientationReason;
  if (!turnsToFit && !run.running && run.error === null) return null;

  return (
    <Flex direction="column" gap="2" align="start">
      {kept === null ? (
        <>
          <Text size="2">{t('print.rotate.hint')}</Text>
          <BusyButton
            variant="soft"
            busy={run.running}
            loading={run.running}
            onClick={() => {
              rotate.mutate();
            }}
          >
            {t('print.rotate.button')}
          </BusyButton>
        </>
      ) : (
        <Text size="2" color="gray">
          {t('print.rotate.kept', { reason: kept })}
        </Text>
      )}
      {run.running && (
        <Text size="1" color="gray">
          {t('print.rotate.running')}
        </Text>
      )}
      {run.error !== null && <ErrorCallout error={run.error} />}
    </Flex>
  );
}
