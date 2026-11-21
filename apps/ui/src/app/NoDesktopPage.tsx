import { Flex, Heading, Text } from '@radix-ui/themes';
import type { i18n } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { AppTheme } from './AppTheme.js';

/** Shown when the window opens without the desktop app behind it, which answers every request. */
export function NoDesktopPage({ i18n }: { i18n: i18n }) {
  return (
    <I18nextProvider i18n={i18n}>
      <AppTheme>
        <NoDesktopMessage />
      </AppTheme>
    </I18nextProvider>
  );
}

function NoDesktopMessage() {
  const { t } = useTranslation();
  return (
    <Flex asChild direction="column" gap="3" p="6" style={{ maxWidth: '56ch' }}>
      <main role="alert">
        <Heading as="h1" size="6">
          {t('app.noDesktopTitle')}
        </Heading>
        <Text color="gray">{t('app.noDesktopBody')}</Text>
      </main>
    </Flex>
  );
}
