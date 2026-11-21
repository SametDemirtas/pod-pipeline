import { Flex, Heading, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { UPSCALE_MODELS } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { useSettings, useUpdateSettings } from '../../shared/use-settings.js';
import { SwitchSetting } from './SwitchSetting.js';

/** How low-resolution artwork is made larger, and whether prepared listings do it unasked. */
export function UpscaleSetting() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('settings.upscale.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.upscale.help')}
      </Text>
      <LabeledSelect
        label={t('settings.upscale.model')}
        value={settings.data?.upscaleModel}
        options={UPSCALE_MODELS.map((value) => ({
          value,
          label: t(`common.upscaleModels.${value}`),
        }))}
        disabled={!settings.data}
        busy={update.isPending}
        onChange={(upscaleModel) => {
          update.mutate({ upscaleModel });
        }}
      />
      {update.isError && <ErrorCallout error={update.error} />}
      <SwitchSetting
        setting="autoUpscale"
        label={t('settings.upscale.auto')}
        help={t('settings.upscale.autoHelp')}
      />
    </Flex>
  );
}
