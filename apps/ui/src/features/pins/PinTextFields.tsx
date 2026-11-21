import { TextArea, TextField } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { PIN_TEXT_LIMITS, typedCharacterCount } from '@pod/rules';
import { Field } from '../../shared/Field.js';
import { PIN_FIELDS, type PinForm, type PinTextField } from './pin-form.js';

interface PinTextFieldsProps {
  readonly form: Pick<PinForm, PinTextField>;
  /** Fields the seller tried to submit while they were wrong. */
  readonly invalid: ReadonlySet<string>;
  readonly onChange: (change: Partial<Pick<PinForm, PinTextField>>) => void;
}

/** Title, description, alt text and headline, each with Pinterest's limit as a count. */
export function PinTextFields({ form, invalid, onChange }: PinTextFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      {PIN_FIELDS.map((field) => {
        const id = `pin-${field}`;
        const used = typedCharacterCount(form[field]);
        const limit = PIN_TEXT_LIMITS[field];
        const wrong = used > limit || invalid.has(field);
        const props = {
          id,
          value: form[field],
          'aria-invalid': wrong,
          onChange: (event: { target: { value: string } }) => {
            onChange({ [field]: event.target.value });
          },
        };
        return (
          <Field
            key={field}
            id={id}
            label={t(`pins.fields.${field}`)}
            hint={t('pins.count', { used, limit })}
            invalid={wrong}
          >
            {(describedBy) =>
              field === 'description' ? (
                <TextArea {...props} rows={3} aria-describedby={describedBy} />
              ) : (
                <TextField.Root
                  {...props}
                  aria-describedby={describedBy}
                  aria-required={field === 'title'}
                />
              )
            }
          </Field>
        );
      })}
    </>
  );
}
