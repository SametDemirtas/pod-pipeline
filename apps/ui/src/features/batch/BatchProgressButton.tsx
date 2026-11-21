import { Button, Dialog, Flex } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { BatchProgress } from './BatchProgress.js';
import { useBatchStatus } from './use-batch.js';

interface BatchProgressButtonProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Opens the run's progress from the page header, once there is a run. */
export function BatchProgressButton({ open, onOpenChange }: BatchProgressButtonProps) {
  const { t } = useTranslation();
  const job = useBatchStatus().data?.job;
  if (!job) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger>
        <Button variant="soft" size="3">
          {t('batch.progressButton', { settled: job.settledDesigns, designs: job.designs })}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="560px" aria-describedby={undefined}>
        <Dialog.Title>{t('batch.progress')}</Dialog.Title>
        <BatchProgress job={job} />
        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              {t('batch.close')}
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
