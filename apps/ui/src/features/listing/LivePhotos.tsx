import { Badge, Box, Flex, Grid, Heading, Link, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { LiveListingPhotosDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useLivePhotos } from './use-listing.js';

/**
 * Shows the photos the Etsy listing has now and the pictures Printful keeps of
 * the linked files, read from them on request, to check before publishing.
 */
export function LivePhotos({ designId }: { designId: string }) {
  const { t } = useTranslation();
  const read = useLivePhotos(designId);

  return (
    <Flex direction="column" gap="2" align="start">
      <Heading as="h3" size="3">
        {t('listing.livePhotos')}
      </Heading>
      <Text size="2" color="gray">
        {t('listing.livePhotosHelp')}
      </Text>
      <BusyButton
        variant="soft"
        busy={read.isPending}
        loading={read.isPending}
        onClick={() => {
          read.mutate();
        }}
      >
        {t(read.data ? 'listing.livePhotosAgain' : 'listing.livePhotosShow')}
      </BusyButton>
      {read.error && <ErrorCallout error={read.error} />}
      {read.data && <LiveResult photos={read.data} />}
    </Flex>
  );
}

function LiveResult({ photos }: { photos: LiveListingPhotosDto }) {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="3" width="100%">
      <Text size="2" weight="medium" role="status">
        {t('listing.livePhotosEtsy', { count: photos.marketplace.length })}
      </Text>
      <Grid columns={{ initial: '3', sm: '4', lg: '5' }} gap="2">
        {photos.marketplace.map((photo, index) => (
          <Tile
            key={photo.url}
            image={photo.image}
            url={photo.url}
            badge={String(index + 1)}
            caption={
              photo.width && photo.height
                ? t('listing.livePhotoSize', { width: photo.width, height: photo.height })
                : ''
            }
            alt={t('listing.livePhotoAlt', { number: index + 1 })}
          />
        ))}
      </Grid>
      <Text size="2" weight="medium">
        {photos.print === null
          ? t('listing.livePhotosNotImported')
          : t('listing.livePhotosPrintful', { count: photos.print.length })}
      </Text>
      {photos.print && (
        <Grid columns={{ initial: '3', sm: '4', lg: '5' }} gap="2">
          {photos.print.map((preview, index) => (
            <Tile
              key={preview.url}
              image={preview.image}
              url={preview.url}
              caption={t(
                preview.kind === 'default'
                  ? 'listing.livePrintFile'
                  : preview.kind === 'preview'
                    ? 'listing.livePrintPreview'
                    : 'listing.livePrintOther',
                { kind: preview.kind },
              )}
              alt={t('listing.livePrintAlt', { number: index + 1 })}
            />
          ))}
        </Grid>
      )}
    </Flex>
  );
}

interface TileProps {
  readonly image: string;
  readonly url: string;
  readonly caption: string;
  readonly alt: string;
  readonly badge?: string;
}

/** A small copy linking to the full picture; a copy that could not be had shows the link alone. */
function Tile({ image, url, caption, alt, badge }: TileProps) {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="1">
      <Link href={url} target="_blank" rel="noreferrer" size="1">
        <Box position="relative">
          {image ? (
            <img
              src={image}
              alt={alt}
              style={{ width: '100%', display: 'block', borderRadius: 4 }}
            />
          ) : (
            <Text size="1">{t('listing.livePhotoOpen', { photo: alt })}</Text>
          )}
          {badge && (
            <Badge variant="solid" style={{ position: 'absolute', top: 6, left: 6 }} aria-hidden>
              {badge}
            </Badge>
          )}
        </Box>
      </Link>
      {caption && (
        <Text size="1" color="gray">
          {caption}
        </Text>
      )}
    </Flex>
  );
}
