import { Button, Flex, TextField } from '@radix-ui/themes';
import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_MODEL_ID_LENGTH, MODEL_ID_PATTERN, type AiModelsDto } from '@pod/contracts/client';
import { Field } from '../../../shared/Field.js';
import { LabeledSelect } from '../../../shared/LabeledSelect.js';

/** The select's entry that asks for a model id the list does not offer; no model id has a colon. */
const OTHER = ':other';

interface ModelPickerProps {
  readonly id: string;
  readonly label: string;
  /** What the choice does and costs. */
  readonly hint: string;
  /** The models offered and the service's default, which saves as none. */
  readonly models: AiModelsDto;
  readonly value: string;
  /** Whether the seller may enter a model the list does not offer. */
  readonly allowOther: boolean;
  /** A change is saving; the select keeps its focus meanwhile. */
  readonly busy: boolean;
  /** `null` goes back to the service's default. */
  readonly onChange: (model: string | null) => void;
}

/** One model of a service: a suggested one, or for a newer model, an id typed in. */
export function ModelPicker(props: ModelPickerProps) {
  const { models, value, allowOther, onChange } = props;
  const { t } = useTranslation();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const field = useRef<HTMLInputElement>(null);
  // Choosing to enter a model moves focus to the field instead of back to the select.
  const focusField = useRef(false);
  const listed = models.models.some((model) => model.id === value);
  const typedId = typed.trim();
  const invalid = typedId !== '' && !MODEL_ID_PATTERN.test(typedId);
  const options = [
    ...models.models.map(({ id }) => ({
      value: id,
      label: id === models.defaultModel ? t('settings.ai.defaultModel', { model: id }) : id,
    })),
    ...(listed ? [] : [{ value, label: value }]),
    ...(allowOther ? [{ value: OTHER, label: t('settings.ai.otherModel') }] : []),
  ];
  const choose = (model: string) => {
    setTyping(false);
    onChange(model === models.defaultModel ? null : model);
  };

  return (
    <Flex direction="column" gap="1" align="start">
      <LabeledSelect
        label={props.label}
        value={typing ? OTHER : value}
        busy={props.busy}
        minWidth={240}
        hint={props.hint}
        options={options}
        onChange={(model) => {
          focusField.current = model === OTHER;
          if (model === OTHER) setTyping(true);
          else choose(model);
        }}
        onCloseAutoFocus={(event) => {
          if (!focusField.current) return;
          focusField.current = false;
          event.preventDefault();
          field.current?.focus();
        }}
      />
      {typing && (
        <OtherModelForm
          id={props.id}
          typed={typed}
          invalid={invalid}
          fieldRef={field}
          onType={setTyped}
          onSave={() => {
            if (typedId && !invalid) choose(typedId);
          }}
          onCancel={() => {
            setTyping(false);
          }}
        />
      )}
    </Flex>
  );
}

interface OtherModelFormProps {
  readonly id: string;
  readonly typed: string;
  readonly invalid: boolean;
  readonly fieldRef: RefObject<HTMLInputElement | null>;
  readonly onType: (typed: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

function OtherModelForm(props: OtherModelFormProps) {
  const { id, typed, invalid } = props;
  const { t } = useTranslation();
  return (
    <Flex asChild direction="column" gap="2" align="start">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave();
        }}
      >
        <Field
          id={id}
          label={t('settings.ai.otherModelLabel')}
          hint={t('settings.ai.otherModelHint')}
          invalid={invalid}
        >
          {(describedBy) => (
            <TextField.Root
              id={id}
              value={typed}
              maxLength={MAX_MODEL_ID_LENGTH}
              aria-describedby={describedBy}
              ref={props.fieldRef}
              aria-invalid={invalid}
              spellCheck={false}
              onChange={(event) => {
                props.onType(event.target.value);
              }}
            />
          )}
        </Field>
        <Flex gap="2">
          <Button type="submit" size="1" variant="soft" disabled={!typed.trim() || invalid}>
            {t('settings.ai.saveModel')}
          </Button>
          <Button type="button" size="1" variant="soft" color="gray" onClick={props.onCancel}>
            {t('common.cancel')}
          </Button>
        </Flex>
      </form>
    </Flex>
  );
}
