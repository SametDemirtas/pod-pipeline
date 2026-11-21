import { Flex, Heading, Switch, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useSettings, useUpdateSettings } from '../../shared/use-settings.js';

/** The settings a switch turns on or off. */
type SwitchedSetting = 'aiDesigns' | 'samsungFromIphone' | 'autoUpscale';

interface SwitchSettingProps {
  readonly setting: SwitchedSetting;
  /** Left out when the switch belongs to a section with its own heading. */
  readonly title?: string;
  readonly label: string;
  readonly help: string;
}

/** One setting that is on or off, saved as soon as it is switched. */
export function SwitchSetting({ setting, title, label, help }: SwitchSettingProps) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const helpId = useId();

  return (
    <Flex direction="column" gap="2">
      {title !== undefined && (
        <Heading as="h2" size="4">
          {title}
        </Heading>
      )}
      <Text as="label" size="2">
        <Flex gap="2" align="center">
          <Switch
            checked={settings.data?.[setting] === true}
            disabled={!settings.data}
            // Keeps the focus while the change saves.
            aria-disabled={update.isPending}
            aria-describedby={helpId}
            onCheckedChange={(on) => {
              if (!update.isPending) update.mutate({ [setting]: on });
            }}
          />
          {label}
        </Flex>
      </Text>
      <Text id={helpId} size="2" color="gray">
        {help}
      </Text>
      {update.isError && <ErrorCallout error={update.error} />}
    </Flex>
  );
}
