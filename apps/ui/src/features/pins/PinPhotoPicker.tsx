import { Badge, Flex, RadioCards, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockupDto } from '@pod/contracts/client';
import { DesignImage } from '../../shared/DesignImage.js';

interface PinPhotoPickerProps {
  readonly mockups: readonly MockupDto[];
  readonly value: string;
  readonly onChange: (mockupId: string) => void;
}

/** The photo the pin image is made from. */
export function PinPhotoPicker({ mockups, value, onChange }: PinPhotoPickerProps) {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    <Flex direction="column" gap="2">
      <Text id={labelId} size="2" weight="medium">
        {t('pins.photo')}
      </Text>
      <RadioCards.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={onChange}
        columns={{ initial: '3', sm: '4' }}
        gap="2"
        size="1"
      >
        {mockups.map((mockup, index) => (
          <RadioCards.Item
            key={mockup.id}
            value={mockup.id}
            aria-label={t(mockup.scenePrompt === null ? 'pins.photoNumber' : 'pins.sceneNumber', {
              number: index + 1,
            })}
          >
            <Flex direction="column" gap="1" width="100%">
              <DesignImage
                storageKey={mockup.asset.storageKey}
                width={160}
                imageWidth={mockup.asset.width}
                imageHeight={mockup.asset.height}
                alt=""
              />
              {mockup.scenePrompt !== null && (
                <Badge size="1" variant="soft">
                  {t('common.sceneBadge')}
                </Badge>
              )}
            </Flex>
          </RadioCards.Item>
        ))}
      </RadioCards.Root>
    </Flex>
  );
}
