import { Badge, Box, Checkbox, Flex, Grid, Text } from '@radix-ui/themes';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type MockupDto } from '@pod/contracts/client';
import { LISTING_LIMITS, isPublishablePhoto } from '@pod/rules';
import { toggledIn } from '../../shared/collections.js';
import { DesignImage } from '../../shared/DesignImage.js';
import { viewLabel } from '../../shared/print-labels.js';

interface PhotoChooserProps {
  readonly mockups: readonly MockupDto[];
  /** In the order buyers see them. */
  readonly chosen: readonly string[];
  readonly onChange: (mockupIds: string[]) => void;
}

/** Mockups to use as listing photos; the number shows the order, 1 is the main photo. */
export function PhotoChooser({ mockups, chosen, onChange }: PhotoChooserProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const full = chosen.length >= LISTING_LIMITS.photos;

  return (
    <Flex direction="column" gap="2" role="group" aria-labelledby={labelId}>
      <Text id={labelId} size="2" weight="medium">
        {t('listing.photos')}
      </Text>
      <Text size="1" color="gray" role="status">
        {t('listing.photosHint', { used: chosen.length, limit: LISTING_LIMITS.photos })}
      </Text>
      <Grid columns={{ initial: '3', sm: '4', lg: '5' }} gap="2">
        {mockups.map((mockup) => {
          const position = chosen.indexOf(mockup.id) + 1;
          const usable = isPublishablePhoto(mockup);
          const reasonId = `${labelId}-${mockup.id}`;
          return (
            <Text as="label" key={mockup.id} size="1">
              <Box position="relative">
                <DesignImage
                  storageKey={mockup.asset.storageKey}
                  width={320}
                  imageWidth={mockup.asset.width}
                  imageHeight={mockup.asset.height}
                  alt=""
                />
                {position > 0 && (
                  <Badge
                    variant="solid"
                    style={{ position: 'absolute', top: 6, left: 6 }}
                    aria-hidden
                  >
                    {position}
                  </Badge>
                )}
              </Box>
              <Flex gap="1" align="center" mt="1">
                <Checkbox
                  checked={position > 0}
                  disabled={!usable || (position === 0 && full)}
                  aria-describedby={usable ? undefined : reasonId}
                  onCheckedChange={(state) => {
                    onChange(toggledIn(chosen, mockup.id, state === true));
                  }}
                />
                {position > 0
                  ? t('listing.photoChosen', { view: viewLabel(t, mockup.view), position })
                  : viewLabel(t, mockup.view)}
              </Flex>
              {!usable && (
                <Text id={reasonId} as="span" size="1" color="gray" style={{ display: 'block' }}>
                  {t('listing.sceneUnconfirmed')}
                </Text>
              )}
            </Text>
          );
        })}
      </Grid>
    </Flex>
  );
}
