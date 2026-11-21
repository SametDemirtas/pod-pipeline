import { CheckCircledIcon, CircleIcon } from '@radix-ui/react-icons';
import { Flex, Heading, Text } from '@radix-ui/themes';
import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { DESIGN_STEPS, type DesignStep, type StepStatus } from '@pod/rules';

const CHIP = { borderRadius: 'var(--radius-3)', padding: 'var(--space-1) var(--space-3)' };
const LIST = { listStyle: 'none', padding: 0, margin: 0 } as const;

const CHIP_STYLES: Readonly<Record<StepStatus, CSSProperties>> = {
  done: { ...CHIP, background: 'var(--accent-a3)' },
  open: { ...CHIP, border: '1px solid var(--accent-a7)' },
  upcoming: { ...CHIP, border: '1px dashed var(--gray-a8)' },
};
const ICONS = { done: CheckCircledIcon, open: CircleIcon, upcoming: null } as const;
const CAPTIONS = { open: 'design.stepsOpen', upcoming: 'design.stepsUpcoming' } as const;

type StepsByStatus = Readonly<Record<DesignStep, StepStatus>>;

/**
 * Where a design stands: finished steps first, then the ones to do now, and
 * the steps that need an earlier one first, set apart under a visible caption
 * so they never read as buttons.
 */
export function StepBar({ statuses }: { statuses: StepsByStatus }) {
  const { t } = useTranslation();
  const stepsAt = (status: StepStatus) => DESIGN_STEPS.filter((step) => statuses[step] === status);

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('design.progress')}
      </Heading>
      <StepChips status="done" steps={stepsAt('done')} label={t('design.stepsDone')} />
      <CaptionedSteps status="open" steps={stepsAt('open')} />
      <CaptionedSteps status="upcoming" steps={stepsAt('upcoming')} />
    </Flex>
  );
}

interface StepChipsProps {
  readonly status: StepStatus;
  readonly steps: readonly DesignStep[];
  readonly label?: string;
  readonly labelledBy?: string;
}

/** The steps of one status as chips; upcoming ones numbered, as their order matters. */
function StepChips({ status, steps, label, labelledBy }: StepChipsProps) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  const List = status === 'upcoming' ? 'ol' : 'ul';
  const Icon = ICONS[status];
  const name = (step: DesignStep) =>
    status === 'upcoming'
      ? `${String(DESIGN_STEPS.indexOf(step) + 1)}. ${t(`design.steps.${step}`)}`
      : t(`design.steps.${step}`);

  return (
    <Flex asChild gap="2" wrap="wrap">
      <List aria-label={label} aria-labelledby={labelledBy} style={LIST}>
        {steps.map((step) => (
          <Flex asChild key={step} align="center" gap="2">
            <li style={CHIP_STYLES[status]}>
              {Icon && <Icon color="var(--accent-11)" aria-hidden />}
              <Text size="2" color={status === 'upcoming' ? 'gray' : undefined}>
                {name(step)}
              </Text>
            </li>
          </Flex>
        ))}
      </List>
    </Flex>
  );
}

/** Steps under a visible caption, left out when there are none. */
function CaptionedSteps(props: { status: 'open' | 'upcoming'; steps: readonly DesignStep[] }) {
  const { t } = useTranslation();
  const captionId = useId();
  if (props.steps.length === 0) return null;
  return (
    <Flex direction="column" gap="2">
      <Text size="2" color="gray" id={captionId}>
        {t(CAPTIONS[props.status])}
      </Text>
      <StepChips status={props.status} steps={props.steps} labelledBy={captionId} />
    </Flex>
  );
}
