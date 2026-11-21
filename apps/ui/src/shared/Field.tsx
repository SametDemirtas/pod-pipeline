import { Flex, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  /** Shown under the input, e.g. a character count or a rule. */
  readonly hint?: string | undefined;
  readonly invalid?: boolean | undefined;
  readonly children: (describedBy: string | undefined) => ReactNode;
}

/** A labelled input with an optional hint that screen readers read with it. */
export function Field({ id, label, hint, invalid, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Flex direction="column" gap="1">
      <Text as="label" size="2" weight="medium" htmlFor={id}>
        {label}
      </Text>
      {children(hintId)}
      {hint && (
        <Text id={hintId} size="1" color={invalid ? 'red' : 'gray'}>
          {hint}
        </Text>
      )}
    </Flex>
  );
}
