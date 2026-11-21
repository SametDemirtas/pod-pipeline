import { Flex } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '../../shared/PageHeading.js';
import { AiDesignsSetting } from './AiDesignsSetting.js';
import { AssistantSetting } from './AssistantSetting.js';
import { ConnectionsSetting } from './connections/ConnectionsSetting.js';
import { ImportFoldersSetting } from './ImportFoldersSetting.js';
import { LanguageSetting } from './LanguageSetting.js';
import { ListingPricesSetting } from './ListingPricesSetting.js';
import { ListingSizesSetting } from './ListingSizesSetting.js';
import { ProductFactsSetting } from './ProductFactsSetting.js';
import { SamsungCasesSetting } from './SamsungCasesSetting.js';
import { UpscaleSetting } from './UpscaleSetting.js';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Flex direction="column" gap="6" style={{ maxWidth: 640 }}>
      <PageHeading>{t('settings.title')}</PageHeading>
      <LanguageSetting />
      <ImportFoldersSetting />
      <SamsungCasesSetting />
      <ConnectionsSetting />
      <ProductFactsSetting />
      <ListingPricesSetting />
      <ListingSizesSetting />
      <UpscaleSetting />
      <AiDesignsSetting />
      <AssistantSetting />
    </Flex>
  );
}
