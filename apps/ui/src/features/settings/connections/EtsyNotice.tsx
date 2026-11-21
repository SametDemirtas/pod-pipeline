import { Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { en } from '../../../i18n/locales/en.js';

/** Etsy's API terms ask for this statement in its own words, which the English text holds. */
const ETSY_NOTICE = en.settings.connections.etsyNotice;

/** The statement Etsy requires of apps using its API, in English as well as the window's language. */
export function EtsyNotice() {
  const { t } = useTranslation();
  const translated = t('settings.connections.etsyNotice');
  return (
    <Text as="p" size="1" color="gray">
      {translated}
      {translated !== ETSY_NOTICE && (
        <>
          {' '}
          <span lang="en">{ETSY_NOTICE}</span>
        </>
      )}
    </Text>
  );
}
