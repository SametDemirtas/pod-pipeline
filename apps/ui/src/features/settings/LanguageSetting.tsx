import { Flex, Heading } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { UI_LANGUAGES } from '@pod/contracts/client';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { useSettings, useUpdateSettings } from '../../shared/use-settings.js';
import { SavedStatus } from './SavedStatus.js';

export function LanguageSetting() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings(async (saved) => {
    await i18n.changeLanguage(saved.language);
  });

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="4">
        {t('settings.languageTitle')}
      </Heading>
      <Flex align="end" gap="3">
        <LabeledSelect
          label={t('settings.language')}
          value={settings.data?.language ?? i18n.language}
          busy={update.isPending}
          minWidth={240}
          options={UI_LANGUAGES.map((language) => ({
            value: language,
            label: t(`settings.languages.${language}`),
          }))}
          onChange={(value) => {
            const language = UI_LANGUAGES.find((supported) => supported === value);
            if (language) update.mutate({ language });
          }}
        />
        <SavedStatus saved={update.isSuccess} />
      </Flex>
      {(settings.isError || update.isError) && (
        <ErrorCallout error={settings.error ?? update.error} />
      )}
    </Flex>
  );
}
