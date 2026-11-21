import { Checkbox, Flex, Text } from '@radix-ui/themes';
import { useId } from 'react';

interface CheckListProps {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly checked: ReadonlySet<string>;
  readonly onToggle: (value: string, on: boolean) => void;
}

/** A labelled group of checkboxes that scrolls when the list is long. */
export function CheckList({ label, options, checked, onToggle }: CheckListProps) {
  const labelId = useId();
  return (
    <Flex direction="column" gap="1" role="group" aria-labelledby={labelId}>
      <Text id={labelId} size="2" weight="medium">
        {label}
      </Text>
      <Flex direction="column" gap="1" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {options.map((option) => (
          <Text as="label" size="2" key={option.value}>
            <Flex gap="2" align="center">
              <Checkbox
                checked={checked.has(option.value)}
                onCheckedChange={(state) => {
                  onToggle(option.value, state === true);
                }}
              />
              {option.label}
            </Flex>
          </Text>
        ))}
      </Flex>
    </Flex>
  );
}
