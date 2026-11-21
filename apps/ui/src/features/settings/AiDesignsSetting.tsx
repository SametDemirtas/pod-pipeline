import { useTranslation } from 'react-i18next';
import { SwitchSetting } from './SwitchSetting.js';

/** Whether the seller's designs are made with AI tools, which every listing then discloses. */
export function AiDesignsSetting() {
  const { t } = useTranslation();
  return (
    <SwitchSetting
      setting="aiDesigns"
      title={t('settings.aiDesigns.title')}
      label={t('settings.aiDesigns.label')}
      help={t('settings.aiDesigns.help')}
    />
  );
}
