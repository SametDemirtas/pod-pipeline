import { Checkbox, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { BATCH_STEPS, type BatchStepDto } from '@pod/contracts/client';
import { withBatchStep } from '@pod/rules';

interface StepChoiceProps {
  readonly steps: readonly BatchStepDto[];
  readonly onChange: (steps: BatchStepDto[]) => void;
}

/** The steps the run takes for each design, each with what it does. */
export function StepChoice({ steps, onChange }: StepChoiceProps) {
  const { t } = useTranslation();

  return (
    <Flex asChild direction="column" gap="2">
      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <Text as="div" size="2" weight="medium" asChild>
          <legend>{t('batch.stepsLabel')}</legend>
        </Text>
        {BATCH_STEPS.map((step) => (
          <Text as="label" size="2" key={step}>
            <Flex gap="2" align="start">
              <Checkbox
                mt="1"
                checked={steps.includes(step)}
                aria-describedby={`batch-step-${step}`}
                onCheckedChange={(checked) => {
                  onChange(withBatchStep(steps, step, checked === true));
                }}
              />
              <Flex direction="column">
                {t(`batch.steps.${step}`)}
                <Text id={`batch-step-${step}`} size="1" color="gray">
                  {t(`batch.stepHints.${step}`)}
                </Text>
              </Flex>
            </Flex>
          </Text>
        ))}
      </fieldset>
    </Flex>
  );
}
