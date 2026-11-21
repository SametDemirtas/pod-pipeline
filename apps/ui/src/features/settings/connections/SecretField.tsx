import { TextField } from '@radix-ui/themes';
import { Field } from '../../../shared/Field.js';

interface SecretFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string | undefined;
  /** Plain fields are for values that are not secret, such as a bucket name. */
  readonly plain?: boolean | undefined;
}

/** A key or setting the browser should neither remember nor spell-check. */
export function SecretField(props: SecretFieldProps) {
  return (
    <Field id={props.id} label={props.label} hint={props.hint}>
      {(describedBy) => (
        <TextField.Root
          id={props.id}
          type={props.plain ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          style={{ width: '100%', maxWidth: 360 }}
          value={props.value}
          aria-describedby={describedBy}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
