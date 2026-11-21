import { CheckIcon } from '@radix-ui/react-icons';
import { Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';

/** Says a setting was saved, where screen readers hear it. */
export function SavedStatus({ saved }: { saved: boolean }) {
  const { t } = useTranslation();
  return (
    <Text size="2" color="jade" role="status">
      {saved && (
        <Flex as="span" align="center" gap="1">
          <CheckIcon />
          {t('settings.saved')}
        </Flex>
      )}
    </Text>
  );
}
