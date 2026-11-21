import { Box, Flex, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assetUrl, type ThumbnailWidth } from '@pod/contracts/client';

const MIN_RATIO = 0.75;
const MAX_RATIO = 2;

/** Frame ratio that follows the image while keeping very tall or wide ones in bounds. */
export function frameRatio(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}

interface DesignImageProps {
  readonly storageKey: string;
  readonly width: ThumbnailWidth;
  readonly alt: string;
  /** Pixel size of the stored image; shapes the frame so the layout does not jump. */
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Keeps a large preview from pushing the rest of the page below the fold. */
  readonly maxHeight?: string;
}

/** A stored design scaled down by the app, in a frame shaped like the image. */
export function DesignImage(props: DesignImageProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  return (
    <Box
      style={{
        aspectRatio: String(frameRatio(props.imageWidth, props.imageHeight)),
        maxHeight: props.maxHeight,
        background: 'var(--gray-a2)',
        borderRadius: 'var(--radius-3)',
        overflow: 'hidden',
      }}
    >
      {failed ? (
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            {t('design.imageMissing')}
          </Text>
        </Flex>
      ) : (
        <img
          src={assetUrl(props.storageKey, props.width)}
          alt={props.alt}
          loading="lazy"
          decoding="async"
          onError={() => {
            setFailed(true);
          }}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      )}
    </Box>
  );
}
