import { useTranslation } from 'react-i18next';
import { SCENE_PROVIDERS } from '@pod/contracts/client';
import { useUpdateSettings } from '../../../shared/use-settings.js';
import type { AiSettingProps } from './ai-setting-props.js';
import { AiSection } from './AiSection.js';
import { ModelPicker } from './ModelPicker.js';

/** The service that makes scene photos, and its model. */
export function ImageAiSetting({ settings, catalog, connections }: AiSettingProps) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const provider = settings.sceneProvider;
  const models = catalog[provider].scenes;

  return (
    <AiSection
      id="image-ai"
      title={t('settings.ai.imageTitle')}
      help={t('settings.ai.imageHelp')}
      providers={SCENE_PROVIDERS}
      provider={provider}
      catalog={catalog}
      connections={connections}
      busy={update.isPending}
      error={update.error}
      onProviderChange={(sceneProvider) => {
        update.mutate({ sceneProvider });
      }}
    >
      {models && (
        <ModelPicker
          id="scene-model"
          label={t('settings.ai.sceneModel')}
          hint={t('settings.ai.sceneModelHint', { service: catalog[provider].service })}
          models={models}
          value={settings.sceneModel}
          allowOther
          busy={update.isPending}
          onChange={(sceneModel) => {
            update.mutate({ sceneModel });
          }}
        />
      )}
    </AiSection>
  );
}
