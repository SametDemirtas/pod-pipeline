import { Flex, Heading, Text } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type MockupDto } from '@pod/contracts/client';
import { LISTING_LIMITS } from '@pod/rules';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useMockups } from '../mockups/use-mockups.js';
import { PhotoChooser } from './PhotoChooser.js';
import { useListingBusy, useReplaceListingPhotos } from './use-listing.js';

interface DraftPhotosProps {
  readonly designId: string;
  /** The design's current revision; photos of earlier ones show other artwork. */
  readonly revision: number;
}

/**
 * Photos of the current artwork that can replace a draft's: Printful's own.
 * Scenes are left out, as only a new draft's description gets the AI note.
 */
function replacementPhotos(mockups: readonly MockupDto[], revision: number): MockupDto[] {
  return mockups.filter(
    (mockup) => mockup.designRevision === revision && mockup.scenePrompt === null,
  );
}

/** Swaps the photos of the design's Etsy draft for chosen mockups, after asking. */
export function DraftPhotos({ designId, revision }: DraftPhotosProps) {
  const { t } = useTranslation();
  const mockups = useMockups(designId);
  if (!mockups.data && !mockups.error) return null;
  const photos = mockups.data ? replacementPhotos(mockups.data, revision) : [];
  return (
    <Flex direction="column" gap="2" align="start">
      <Heading as="h3" size="3">
        {t('listing.draftPhotos')}
      </Heading>
      <Text size="2" color="gray">
        {t('listing.draftPhotosHelp')}
      </Text>
      {!mockups.data ? (
        <ErrorCallout
          error={mockups.error}
          onRetry={() => {
            void mockups.refetch();
          }}
        />
      ) : photos.length === 0 ? (
        <Text size="2" color="gray">
          {t('listing.draftPhotosNone')}
        </Text>
      ) : (
        // New mockups start the choice over with the newest photos.
        <PhotoUpdate
          key={photos.map((photo) => photo.id).join()}
          designId={designId}
          photos={photos}
        />
      )}
    </Flex>
  );
}

function PhotoUpdate({ designId, photos }: { designId: string; photos: readonly MockupDto[] }) {
  const { t } = useTranslation();
  const replace = useReplaceListingPhotos(designId);
  const busy = useListingBusy(designId);
  const [chosen, setChosen] = useState<string[]>(() =>
    photos.slice(0, LISTING_LIMITS.photos).map((photo) => photo.id),
  );

  return (
    <>
      <PhotoChooser
        mockups={photos}
        chosen={chosen}
        onChange={(mockupIds) => {
          setChosen(mockupIds);
          replace.reset();
        }}
      />
      <ConfirmDialog
        trigger={
          <BusyButton variant="soft" busy={busy || chosen.length === 0} loading={replace.isPending}>
            {t('listing.updatePhotos')}
          </BusyButton>
        }
        title={t('listing.updatePhotosTitle')}
        description={t('listing.updatePhotosWarning')}
        confirmLabel={t('listing.updatePhotosConfirm')}
        color="red"
        onConfirm={() => {
          replace.mutate(chosen);
        }}
      />
      {replace.isSuccess && (
        <Text size="2" color="jade" role="status">
          {t('listing.photosUpdated')}
        </Text>
      )}
      {replace.error && <ErrorCallout error={replace.error} />}
    </>
  );
}
