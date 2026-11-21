import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Button, Callout, Dialog, Flex, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type BatchRequest,
  type BatchSelection,
  type BatchStepDto,
  type ResearchMarket,
} from '@pod/contracts/client';
import { defaultBatchSteps } from '@pod/rules';
import { BusyButton } from '../../shared/BusyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { useChosenAi } from '../../shared/use-ai.js';
import { useSettings } from '../../shared/use-settings.js';
import { DEFAULT_MARKET, marketOptions } from '../../shared/market-label.js';
import { BatchEstimate } from './BatchEstimate.js';
import { StepChoice } from './StepChoice.js';
import { useBatchEstimate, useBatchStatus, useStartBatch } from './use-batch.js';

interface PrepareDialogProps {
  /** `null` while nothing is picked. */
  readonly selection: BatchSelection | null;
  readonly onStarted: () => void;
}

/**
 * Lets the seller choose the steps and market, shows what the run would do
 * and cost, and starts it only once they confirm.
 */
export function PrepareDialog({ selection, onStarted }: PrepareDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const autoUpscale = useSettings().data?.autoUpscale === true;
  // `null` until the seller changes the steps, so the settings decide the first choice.
  const [chosenSteps, setSteps] = useState<readonly BatchStepDto[] | null>(null);
  const steps = chosenSteps ?? defaultBatchSteps(autoUpscale);
  const [market, setMarket] = useState<ResearchMarket>(DEFAULT_MARKET);
  const request: BatchRequest | null =
    open && selection && steps.length > 0 ? { selection, steps: [...steps], market } : null;
  const estimate = useBatchEstimate(request);
  const job = useBatchStatus().data?.job ?? null;
  const writer = useChosenAi().text;
  const start = useStartBatch();
  const textOff = steps.includes('text') && !writer.connected;
  const running = job?.state === 'running';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Closing while the run starts would hide whether it did.
        if (!next && start.isPending) return;
        setOpen(next);
        start.reset();
      }}
    >
      <Dialog.Trigger>
        <Button disabled={selection === null}>{t('batch.prepare')}</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>{t('batch.prepare')}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {t('batch.dialogHelp')}
        </Dialog.Description>
        <Flex direction="column" gap="4" mt="4">
          <StepChoice steps={steps} onChange={setSteps} />
          {steps.includes('research') && (
            <LabeledSelect
              label={t('batch.market')}
              value={market}
              options={marketOptions(t)}
              onChange={setMarket}
            />
          )}
          {textOff && <TextOffNotice service={writer.service} />}
          {request && <BatchEstimate steps={steps} estimate={estimate} />}
          {job && <EarlierRunNote running={running} />}
          {start.error && <ErrorCallout error={start.error} />}
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                {t('common.cancel')}
              </Button>
            </Dialog.Close>
            <BusyButton
              busy={start.isPending}
              loading={start.isPending}
              disabled={!request || !estimate.data || textOff || running}
              onClick={() => {
                if (!request) return;
                start.mutate(request, {
                  onSuccess: () => {
                    setOpen(false);
                    onStarted();
                  },
                });
              }}
            >
              {t('batch.start')}
            </BusyButton>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function TextOffNotice({ service }: { service: string }) {
  const { t } = useTranslation();
  return (
    <Callout.Root color="gray" role="status">
      <Callout.Icon>
        <InfoCircledIcon />
      </Callout.Icon>
      <Callout.Text>{t('batch.textOff', { service })}</Callout.Text>
    </Callout.Root>
  );
}

/** A new run replaces the last one, and cannot start while that one runs. */
function EarlierRunNote({ running }: { running: boolean }) {
  const { t } = useTranslation();
  return running ? (
    <Text size="2" color="amber" role="status">
      {t('errors.BATCH_IN_PROGRESS')}
    </Text>
  ) : (
    <Text size="2" color="gray">
      {t('batch.replaces')}
    </Text>
  );
}
