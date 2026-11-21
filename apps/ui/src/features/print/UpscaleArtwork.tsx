import { Flex, Progress, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { DesignDetailDto } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { useUpscale, useUpscaleProgress, useUpscaleRun } from './use-upscale.js';

interface UpscaleArtworkProps {
  readonly design: DesignDetailDto;
  /** The check found the artwork too small for the chosen size. */
  readonly blurry: boolean;
}

/**
 * Offers to make low-resolution artwork four times larger on this computer,
 * also again when a larger copy is too small for the chosen size, and says
 * which artwork was made larger already. Once a copy is as large as
 * upscaling makes it, it offers no more.
 */
export function UpscaleArtwork({ design, blurry }: UpscaleArtworkProps) {
  const { t } = useTranslation();
  const upscale = useUpscale(design.id);
  const run = useUpscaleRun(design.id, design.revision);
  const share = useUpscaleProgress(design.id, run.running);

  const imported = design.revisions.find((revision) => revision.upscaleModel === null);
  const done = design.upscaleModel !== null && imported !== undefined && (
    <Text size="2" color="gray">
      {t('print.upscale.done', {
        model: t(`common.upscaleModels.${design.upscaleModel}`),
        revision: imported.revision,
      })}
    </Text>
  );
  if (!blurry && !run.running) return done || null;

  return (
    <Flex direction="column" gap="2" align="start">
      {done}
      {!run.largest && (
        <>
          <Text size="2">{t('print.upscale.hint')}</Text>
          <BusyButton
            variant="soft"
            busy={run.running}
            loading={run.running}
            onClick={() => {
              upscale.mutate(design.revision);
            }}
          >
            {t('print.upscale.button')}
          </BusyButton>
        </>
      )}
      {run.running && (
        <Flex direction="column" gap="1" width="100%">
          <Progress
            value={share === null ? undefined : share * 100}
            aria-label={t('print.upscale.progressLabel')}
          />
          <Text size="1" color="gray">
            {t('print.upscale.running')}
          </Text>
        </Flex>
      )}
      {run.error !== null && <ErrorCallout error={run.error} />}
    </Flex>
  );
}
