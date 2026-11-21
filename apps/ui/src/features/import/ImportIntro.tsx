import { Code, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';

/** First wizard step: what to choose, with the two folder layouts as examples. */
export function ImportIntro() {
  const { t } = useTranslation();

  return (
    <Flex direction="column" gap="3">
      <Text>{t('import.intro')}</Text>
      <Flex asChild direction="column" gap="2">
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          <li>
            <Code variant="ghost">{t('import.exampleFolder')}</Code>
          </li>
          <li>
            <Code variant="ghost">{t('import.exampleFlat')}</Code>{' '}
            <Text size="2" color="gray">
              {t('import.exampleFlatNote')}
            </Text>
          </li>
        </ul>
      </Flex>
      <Text size="2" color="gray">
        {t('import.exampleNames')}
      </Text>
    </Flex>
  );
}
