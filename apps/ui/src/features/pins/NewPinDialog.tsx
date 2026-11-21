import { Button, Dialog, Flex, Text } from '@radix-ui/themes';
import { useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockupDto, BoardDto } from '@pod/contracts/client';
import { PIN_TEXT_LIMITS } from '@pod/rules';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { FormProblems } from '../../shared/FormProblems.js';
import { BusyButton } from '../../shared/BusyButton.js';
import {
  initialPinForm,
  isPinTextField,
  pinFormProblems,
  toPlanPinRequest,
  type PinForm,
  type PinFormProblem,
} from './pin-form.js';
import { PinPhotoPicker } from './PinPhotoPicker.js';
import { PinScheduleFields } from './PinScheduleFields.js';
import { PinTextFields } from './PinTextFields.js';
import { usePlanPin } from './use-pins.js';

interface NewPinDialogProps {
  readonly designId: string;
  readonly defaultTitle: string;
  readonly mockups: readonly MockupDto[];
  readonly boards: readonly BoardDto[];
}

/** Plans a pin: a photo, its words, a board and a time; the app publishes it then. */
export function NewPinDialog(props: NewPinDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pin = usePinForm(props);
  const { form, problems, update } = pin;
  const plan = usePlanPin(props.designId);
  const invalid = new Set<string>(problems);
  const problemsRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Closing while the pin image is made would hide whether it worked.
        if (!next && plan.isPending) return;
        setOpen(next);
        if (next) {
          pin.restart();
          plan.reset();
        }
      }}
    >
      <Dialog.Trigger>
        <Button>{t('pins.new')}</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>{t('pins.newTitle')}</Dialog.Title>
        <Dialog.Description size="2">{t('pins.newHelp')}</Dialog.Description>
        <Flex asChild direction="column" gap="3" mt="3">
          <form
            aria-label={t('pins.newTitle')}
            onSubmit={(event) => {
              event.preventDefault();
              pin.check();
              const request = toPlanPinRequest(props.designId, form, new Date());
              if (!request) {
                requestAnimationFrame(() => problemsRef.current?.focus());
                return;
              }
              plan.mutate(request, {
                onSuccess: () => {
                  setOpen(false);
                },
              });
            }}
          >
            <PinPhotoPicker
              mockups={props.mockups}
              value={form.mockupId}
              onChange={(mockupId) => {
                update({ mockupId });
              }}
            />
            <PinTextFields form={form} invalid={invalid} onChange={update} />
            <PinScheduleFields
              form={form}
              boards={props.boards}
              invalid={invalid}
              onChange={update}
            />
            <Text size="1" color="gray" role="status">
              {plan.isPending ? t('pins.making') : ''}
            </Text>
            <PinProblems ref={problemsRef} problems={problems} />
            {plan.error && <ErrorCallout error={plan.error} />}
            <PlanPinFooter pending={plan.isPending} />
          </form>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** The pin being planned, and what is wrong with it once the seller tried to plan it. */
function usePinForm({ defaultTitle, mockups, boards }: Omit<NewPinDialogProps, 'designId'>) {
  const fresh = () =>
    initialPinForm({
      title: defaultTitle,
      mockupId: mockups[0]?.id ?? '',
      boardId: boards[0]?.id ?? '',
      now: new Date(),
    });
  const [form, setForm] = useState<PinForm>(fresh);
  const [checked, setChecked] = useState(false);
  return {
    form,
    problems: checked ? pinFormProblems(form, new Date()) : [],
    update: (change: Partial<PinForm>) => {
      setForm((current) => ({ ...current, ...change }));
    },
    check: () => {
      setChecked(true);
    },
    restart: () => {
      setForm(fresh());
      setChecked(false);
    },
  };
}

interface PinProblemsProps {
  readonly ref: Ref<HTMLDivElement>;
  readonly problems: readonly PinFormProblem[];
}

function PinProblems({ ref, problems }: PinProblemsProps) {
  const { t } = useTranslation();
  if (problems.length === 0) return null;
  return (
    <FormProblems
      ref={ref}
      title={t('pins.problemsTitle')}
      problems={problems.map((problem) =>
        // Limits come from the code, so the message never disagrees with the check.
        t(`pins.problems.${problem}`, {
          limit: isPinTextField(problem) ? PIN_TEXT_LIMITS[problem] : undefined,
        }),
      )}
    />
  );
}

interface PlanPinFooterProps {
  readonly pending: boolean;
}

function PlanPinFooter({ pending }: PlanPinFooterProps) {
  const { t } = useTranslation();
  return (
    <Flex gap="3" justify="end">
      <Dialog.Close>
        <Button type="button" variant="soft" color="gray" disabled={pending}>
          {t('common.cancel')}
        </Button>
      </Dialog.Close>
      <BusyButton type="submit" busy={pending} loading={pending}>
        {t('pins.plan')}
      </BusyButton>
    </Flex>
  );
}
