import { Button, Flex, Progress, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { BatchJobDto } from '@pod/contracts/client';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { resetOthers } from '../../shared/reset-others.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { retriable } from './batch-failures.js';
import { FailureList } from './FailureList.js';
import { useCancelBatch, useResumeBatch, useRetryBatch } from './use-batch.js';

/** How far the run got: overall, per step and design by design, with what can be done next. */
export function BatchProgress({ job }: { job: BatchJobDto }) {
  const { t } = useTranslation();
  const cancel = useCancelBatch();
  const resume = useResumeBatch();
  const retry = useRetryBatch();
  const running = job.state === 'running';
  const changes = [cancel, resume, retry];
  const error = cancel.error ?? resume.error ?? retry.error;
  const idle = !running && !job.current;
  const canRetry = job.failures.some(retriable);

  return (
    <Flex direction="column" gap="4">
      <RunSummary job={job} />
      <StepList job={job} />
      <FailureList failures={job.failures} />
      <Flex gap="3" wrap="wrap">
        {running && (
          <ConfirmDialog
            trigger={
              <Button variant="soft" color="red">
                {t('batch.cancel')}
              </Button>
            }
            title={t('batch.cancelTitle')}
            description={t('batch.cancelBody')}
            confirmLabel={t('batch.cancel')}
            color="red"
            onConfirm={() => {
              resetOthers(changes, cancel);
              cancel.mutate();
            }}
          />
        )}
        {idle && job.settledDesigns < job.designs && (
          <BusyButton
            variant="soft"
            busy={resume.isPending}
            loading={resume.isPending}
            onClick={() => {
              resetOthers(changes, resume);
              resume.mutate();
            }}
          >
            {t('batch.resume')}
          </BusyButton>
        )}
        {idle && canRetry && (
          <BusyButton
            variant="soft"
            busy={retry.isPending}
            loading={retry.isPending}
            onClick={() => {
              resetOthers(changes, retry);
              retry.mutate();
            }}
          >
            {t('batch.retry')}
          </BusyButton>
        )}
      </Flex>
      {error !== null && <ErrorCallout error={error} />}
    </Flex>
  );
}

function RunSummary({ job }: { job: BatchJobDto }) {
  const { t } = useTranslation();
  const running = job.state === 'running';
  const share = job.designs === 0 ? 0 : (job.settledDesigns / job.designs) * 100;
  const overall = t('batch.overall', { settled: job.settledDesigns, designs: job.designs });
  return (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {t(`batch.states.${job.state}`)}
      </Text>
      <Progress value={share} aria-label={overall} />
      <Text size="2">{overall}</Text>
      <Text size="2" color="gray" role="status">
        {job.current &&
          (running
            ? t('batch.current', {
                design: job.current.designKey,
                step: t(`batch.steps.${job.current.step}`),
              })
            : t('batch.stopping'))}
      </Text>
    </Flex>
  );
}

function StepList({ job }: { job: BatchJobDto }) {
  const { t } = useTranslation();
  return (
    <Flex asChild direction="column" gap="1">
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {job.steps.map((step) => {
          const counts = job.stepCounts[step];
          return (
            <Text as="p" size="2" key={step} asChild>
              <li>
                <Text weight="medium">{t(`batch.steps.${step}`)}</Text>
                {counts &&
                  `: ${t('batch.stepCount', {
                    ...counts,
                    waiting: counts.pending + counts.running,
                  })}`}
              </li>
            </Text>
          );
        })}
      </ul>
    </Flex>
  );
}
