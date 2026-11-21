import { useTranslation } from 'react-i18next';
import { SwitchSetting } from './SwitchSetting.js';

/** Whether importing a phone case file also makes a Samsung case from it. */
export function SamsungCasesSetting() {
  const { t } = useTranslation();
  return (
    <SwitchSetting
      setting="samsungFromIphone"
      title={t('settings.samsungFromIphone.title')}
      label={t('settings.samsungFromIphone.label')}
      help={t('settings.samsungFromIphone.help')}
    />
  );
}
