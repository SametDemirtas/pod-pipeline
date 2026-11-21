import { useTranslation } from 'react-i18next';
import { AI_PROVIDERS } from '@pod/contracts/client';
import { useUpdateSettings } from '../../../shared/use-settings.js';
import type { AiSettingProps } from './ai-setting-props.js';
import { AiSection } from './AiSection.js';
import { ModelPicker } from './ModelPicker.js';

/** The service that writes listing text and looks at photos, and its two models. */
export function TextAiSetting({ settings, catalog, connections }: AiSettingProps) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const models = catalog[settings.textProvider].text;

  return (
    <AiSection
      id="text-ai"
      title={t('settings.ai.textTitle')}
      help={t('settings.ai.textHelp')}
      providers={AI_PROVIDERS}
      provider={settings.textProvider}
      catalog={catalog}
      connections={connections}
      busy={update.isPending}
      error={update.error}
      onProviderChange={(textProvider) => {
        update.mutate({ textProvider });
      }}
    >
      <ModelPicker
        id="text-model"
        label={t('settings.ai.textModel')}
        hint={t('settings.ai.textModelHint')}
        models={models}
        value={settings.textModel}
        allowOther
        busy={update.isPending}
        onChange={(textModel) => {
          update.mutate({ textModel });
        }}
      />
      <ModelPicker
        id="check-model"
        label={t('settings.ai.checkModel')}
        hint={t('settings.ai.checkModelHint')}
        // Checking compares photos, so only models that read images are offered.
        models={{
          defaultModel: models.defaultCheckModel,
          models: models.models.filter((model) => model.seesImages),
        }}
        value={settings.checkModel}
        allowOther={models.othersSeeImages}
        busy={update.isPending}
        onChange={(checkModel) => {
          update.mutate({ checkModel });
        }}
      />
    </AiSection>
  );
}
