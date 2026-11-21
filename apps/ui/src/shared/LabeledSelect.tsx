import { Flex, Select, Text, VisuallyHidden } from '@radix-ui/themes';
import { useId, useState } from 'react';

export interface SelectOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
}

/** Options of names shown as they are, or of the shop's options by their id. */
export function asOptions(
  values: readonly (string | { readonly id: string; readonly label: string })[],
): SelectOption[] {
  return values.map((value) =>
    typeof value === 'string' ? { value, label: value } : { value: value.id, label: value.label },
  );
}

interface LabeledSelectProps<V extends string> {
  readonly label: string;
  /** Read by screen readers only, for a select in a row with what it is for. */
  readonly hideLabel?: boolean;
  /** `undefined` shows no choice yet. */
  readonly value: V | undefined;
  readonly options: readonly SelectOption<V>[];
  readonly onChange: (value: V) => void;
  readonly disabled?: boolean;
  /** A change is saving; the select keeps its focus but does not open meanwhile. */
  readonly busy?: boolean;
  readonly minWidth?: number;
  /** Shown under the select and read with it, e.g. what the choice costs. */
  readonly hint?: string;
  /** Runs as the list closes; preventing it keeps focus from returning to the select. */
  readonly onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A select with a label that screen readers read with it; visible unless
 * `hideLabel` leaves it to screen readers, for a select in a row with what it is for.
 */
export function LabeledSelect<V extends string = string>(props: LabeledSelectProps<V>) {
  const labelId = useId();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const busy = props.busy === true;
  // A list open when a change starts closes, so it cannot take a second change.
  if (busy && open) setOpen(false);
  return (
    <Flex direction="column" gap="1" align="start">
      {props.hideLabel ? (
        <VisuallyHidden id={labelId}>{props.label}</VisuallyHidden>
      ) : (
        <Text id={labelId} size="2" weight="medium">
          {props.label}
        </Text>
      )}
      <Select.Root
        value={props.value}
        open={open}
        onOpenChange={(next) => {
          if (!next || !busy) setOpen(next);
        }}
        // Radix passes back the value of one of the options given.
        onValueChange={(value) => {
          if (!busy) props.onChange(value as V);
        }}
        disabled={props.disabled === true || props.options.length === 0}
      >
        <Select.Trigger
          aria-labelledby={labelId}
          aria-disabled={busy}
          aria-describedby={props.hint ? hintId : undefined}
          style={{ minWidth: props.minWidth ?? 200 }}
        />
        <Select.Content position="popper" onCloseAutoFocus={props.onCloseAutoFocus}>
          {props.options.map((option) => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {props.hint && (
        <Text id={hintId} size="1" color="gray">
          {props.hint}
        </Text>
      )}
    </Flex>
  );
}
