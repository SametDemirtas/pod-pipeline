import { Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { AiTellDto } from '@pod/contracts/client';

interface HumanizerStatusProps {
  /** Phrases the writer's revision took out. */
  readonly fixed: number;
  /** Phrases still in the words. */
  readonly left: readonly AiTellDto[];
}

/** Whether the words read as machine-written, with the phrases left for the seller to rewrite. */
export function HumanizerStatus({ fixed, left }: HumanizerStatusProps) {
  const { t } = useTranslation();
  const phrases = [...new Set(left.map((tell) => tell.match))];
  return (
    <Flex direction="column" gap="1" role="status">
      {(fixed > 0 || phrases.length === 0) && (
        <Text size="1" color="gray">
          {fixed > 0 ? t('listing.humanizerFixed', { count: fixed }) : t('listing.humanizerClean')}
        </Text>
      )}
      {phrases.length > 0 && (
        <>
          <Text size="1" color="amber">
            {t('listing.humanizerLeft', { count: phrases.length })}
          </Text>
          <Text asChild size="1">
            <ul aria-label={t('listing.humanizerPhrases')} style={{ margin: 0 }}>
              {phrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
          </Text>
        </>
      )}
    </Flex>
  );
}
