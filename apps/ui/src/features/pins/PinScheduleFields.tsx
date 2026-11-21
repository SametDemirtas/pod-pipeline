import { Flex, TextField } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { BoardDto } from '@pod/contracts/client';
import { Field } from '../../shared/Field.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import type { PinForm } from './pin-form.js';

interface PinScheduleFieldsProps {
  readonly form: PinForm;
  readonly boards: readonly BoardDto[];
  /** Fields the seller tried to submit while they were wrong. */
  readonly invalid: ReadonlySet<string>;
  readonly onChange: (change: Partial<PinForm>) => void;
}

/** The board a pin goes to and when it is published. */
export function PinScheduleFields({ form, boards, invalid, onChange }: PinScheduleFieldsProps) {
  const { t } = useTranslation();
  const publishAtInvalid = invalid.has('publishAt') || invalid.has('publishAtPast');
  return (
    <Flex gap="3" wrap="wrap">
      <div style={{ flex: '1 1 200px' }}>
        <LabeledSelect
          label={t('pins.board')}
          value={form.boardId}
          options={boards.map((board) => ({ value: board.id, label: board.name }))}
          onChange={(boardId) => {
            onChange({ boardId });
          }}
        />
      </div>
      <div style={{ flex: '1 1 200px' }}>
        <Field
          id="pin-publish-at"
          label={t('pins.publishAt')}
          hint={t('pins.publishAtHint')}
          invalid={publishAtInvalid}
        >
          {(describedBy) => (
            <TextField.Root
              id="pin-publish-at"
              type="datetime-local"
              value={form.publishAt}
              aria-describedby={describedBy}
              aria-invalid={publishAtInvalid}
              onChange={(event) => {
                onChange({ publishAt: event.target.value });
              }}
            />
          )}
        </Field>
      </div>
    </Flex>
  );
}
