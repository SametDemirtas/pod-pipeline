import { Button, Callout, Flex } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';

interface SceneStyleOfferProps {
  /** The service that described the photo. */
  readonly service: string;
  readonly onTake: () => void;
  readonly onKeep: () => void;
}

/** Asks whether a photo's described style replaces the description the seller already wrote. */
export function SceneStyleOffer({ service, onTake, onKeep }: SceneStyleOfferProps) {
  const { t } = useTranslation();
  return (
    <Callout.Root color="blue" size="1">
      <Flex direction="column" gap="2" align="start">
        <Callout.Text>{t('scenes.style.replaceQuestion', { service })}</Callout.Text>
        <Flex gap="2">
          <Button size="1" type="button" onClick={onTake}>
            {t('scenes.style.replace')}
          </Button>
          <Button size="1" type="button" variant="soft" color="gray" onClick={onKeep}>
            {t('scenes.style.keep')}
          </Button>
        </Flex>
      </Flex>
    </Callout.Root>
  );
}
